import { Decimal } from '../../calculation/decimal';
import { HistoryRuleError, HistoryRules, planAppend, planTermination } from '../../history/history-rules';
import { RowReader } from '../excel/row-reader';
import { ColumnSpec, SheetRow } from '../excel/sheet';
import {
  applyAppend,
  applyEndChanges,
  AssignmentPayload,
  changedRecords,
  duplicatedCodes,
  RefEntry,
  RowOutcome,
  SalaryPayload,
  TeamLinkPayload,
  TrackedRecord,
} from './tracked-history';

export const EMPLOYEE_COLUMNS: ColumnSpec[] = [
  { name: 'xodim_kodi', required: true },
  { name: 'familiya', required: false },
  { name: 'ism', required: false },
  { name: 'otasining_ismi', required: false },
  { name: 'ishga_kirgan_sana', required: false },
  { name: 'ishdan_ketgan_sana', required: false },
  { name: 'bolim_kodi', required: false },
  { name: 'lavozim_kodi', required: false },
  { name: 'lavozim_sanasi', required: false },
  { name: 'oylik', required: false },
  { name: 'oylik_sanasi', required: false },
];

export interface EmployeeFields {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  isActive: boolean;
}

export interface EmployeeState {
  /** null — bazada yo'q, import yaratadi. */
  id: bigint | null;
  code: string;
  fields: EmployeeFields;
  /** Bazadagi holat; yangi xodim uchun null. */
  original: EmployeeFields | null;
  assignments: TrackedRecord<AssignmentPayload>[];
  salaries: TrackedRecord<SalaryPayload>[];
  /** Xodim rahbar yoki a'zo bo'lgan havolalar (ishdan ketishda yopiladi). Obyektlar xodimlar orasida umumiy. */
  teamLinks: TrackedRecord<TeamLinkPayload>[];
}

export interface EmployeeImportContext {
  /** Kod → holat. Reja shu obyektlarni o'zgartiradi, yangi xodimlar ham shu yerga qo'shiladi. */
  employees: Map<string, EmployeeState>;
  departments: Map<string, RefEntry>;
  positions: Map<string, RefEntry>;
  rules: Pick<HistoryRules, 'lastClosedDay'>;
  newId: () => bigint;
}

const NAME_MAX = 100;
const CODE_MAX = 50;

/**
 * EMPLOYEES importi: xodim + (ixtiyoriy) joriy lavozim va oylik.
 * Bo'sh katakcha mavjud qiymatni o'zgartirmaydi. Faylda yo'q xodimga tegilmaydi.
 */
export function planEmployeeRows(rows: readonly SheetRow[], ctx: EmployeeImportContext): RowOutcome[] {
  const duplicates = duplicatedCodes(rows.map((row) => new RowReader(row.values).text('xodim_kodi', { required: false, max: CODE_MAX })));
  return rows.map((row) => planRow(row, ctx, duplicates));
}

function planRow(row: SheetRow, ctx: EmployeeImportContext, duplicates: Set<string>): RowOutcome {
  const r = new RowReader(row.values);
  const code = r.text('xodim_kodi', { required: true, max: CODE_MAX });
  const input = {
    lastName: r.text('familiya', { required: false, max: NAME_MAX }),
    firstName: r.text('ism', { required: false, max: NAME_MAX }),
    middleName: r.text('otasining_ismi', { required: false, max: NAME_MAX }),
    hireDate: r.date('ishga_kirgan_sana', { required: false }),
    terminationDate: r.date('ishdan_ketgan_sana', { required: false }),
  };

  let assignment: { department: RefEntry | null; position: RefEntry | null; startDate: string | null } | null = null;
  if (['bolim_kodi', 'lavozim_kodi', 'lavozim_sanasi'].some((field) => r.has(field))) {
    assignment = {
      department: lookup(r, 'bolim_kodi', ctx.departments, "Bo'lim"),
      position: lookup(r, 'lavozim_kodi', ctx.positions, 'Lavozim'),
      startDate: r.date('lavozim_sanasi', { required: true }),
    };
  }
  let salary: { amount: Decimal | null; startDate: string | null } | null = null;
  if (['oylik', 'oylik_sanasi'].some((field) => r.has(field))) {
    salary = { amount: r.money('oylik', { required: true }), startDate: r.date('oylik_sanasi', { required: true }) };
  }
  if (code !== null && duplicates.has(code)) r.addError('xodim_kodi', `Kod faylda bir necha marta uchraydi: ${code}`);
  if (code === null || r.errors.length > 0) return failed(row, code, r);

  const isNew = !ctx.employees.has(code);
  const state = ctx.employees.get(code) ?? newEmployee(code);
  const before = snapshot(state);

  for (const key of ['lastName', 'firstName', 'middleName', 'hireDate'] as const) {
    if (input[key] !== null) state.fields[key] = input[key];
  }
  const terminationChanged = input.terminationDate !== null && input.terminationDate !== state.fields.terminationDate;
  if (terminationChanged) state.fields.terminationDate = input.terminationDate;
  if (state.fields.hireDate && state.fields.terminationDate && state.fields.terminationDate < state.fields.hireDate) {
    r.addError('ishdan_ketgan_sana', "Ishdan ketgan sana ishga kirgan sanadan oldin bo'lmasligi kerak");
  }

  const monthly: HistoryRules = { lastClosedDay: ctx.rules.lastClosedDay, monthStartOnly: true };
  if (assignment && assignment.department && assignment.position && assignment.startDate) {
    const { department, position, startDate } = assignment;
    withRuleErrors(r, 'lavozim_sanasi', () => {
      const appendInput = { startDate, endDate: null, valueKey: `${department.id}:${position.id}` };
      const plan = planAppend(state.assignments, appendInput, monthly);
      if (plan.kind === 'APPEND') {
        requireActive(r, 'bolim_kodi', department, "Bo'lim");
        requireActive(r, 'lavozim_kodi', position, 'Lavozim');
      }
      const payload = { departmentId: department.id, positionId: position.id };
      applyAppend(state.assignments, plan, appendInput, payload, ctx.newId);
    });
  }
  if (salary && salary.amount && salary.startDate) {
    const { amount, startDate } = salary;
    withRuleErrors(r, 'oylik_sanasi', () => {
      const appendInput = { startDate, endDate: null, valueKey: amount.toFixed(2) };
      const plan = planAppend(state.salaries, appendInput, monthly);
      applyAppend(state.salaries, plan, appendInput, { salaryAmount: amount }, ctx.newId);
    });
  }
  if (terminationChanged && input.terminationDate) {
    const terminationDate = input.terminationDate;
    state.fields.isActive = false;
    withRuleErrors(r, 'ishdan_ketgan_sana', () => {
      // Avval hammasi tekshiriladi, keyin qo'llanadi — yarim qo'llangan holat qolmasin.
      const changes = [state.assignments, state.salaries, state.teamLinks].map((records) =>
        planTermination(records, terminationDate, monthly),
      );
      applyEndChanges(state.assignments, changes[0]);
      applyEndChanges(state.salaries, changes[1]);
      applyEndChanges(state.teamLinks, changes[2]);
    });
  }

  if (r.errors.length > 0) return failed(row, code, r);
  if (isNew) ctx.employees.set(code, state);
  const outcome = isNew ? 'CREATED' : snapshot(state) === before ? 'UNCHANGED' : 'UPDATED';
  return { rowNumber: row.rowNumber, employeeCode: code, outcome, errors: [] };
}

function newEmployee(code: string): EmployeeState {
  return {
    id: null,
    code,
    fields: { firstName: null, lastName: null, middleName: null, hireDate: null, terminationDate: null, isActive: true },
    original: null,
    assignments: [],
    salaries: [],
    teamLinks: [],
  };
}

/** O'zgarish bo'ldimi — maydonlar va tarixiy yozuvlar holatini solishtirish uchun. */
function snapshot(state: EmployeeState): string {
  const history = [state.assignments, state.salaries, state.teamLinks].map((records) => {
    const { updates, creates } = changedRecords(records as TrackedRecord<unknown>[]);
    return [...updates, ...creates].map((record) => `${record.id}:${record.endDate}`).join(',');
  });
  return JSON.stringify({ fields: state.fields, history });
}

function lookup(r: RowReader, field: string, entries: Map<string, RefEntry>, label: string): RefEntry | null {
  const code = r.text(field, { required: true, max: CODE_MAX });
  if (code === null) return null;
  const entry = entries.get(code);
  if (!entry) r.addError(field, `${label} topilmadi: ${code}`);
  return entry ?? null;
}

export function requireActive(r: RowReader, field: string, entry: RefEntry, label: string): void {
  if (!entry.isActive) r.addError(field, `${label} nofaol — yangi yozuvda ishlatib bo'lmaydi`);
}

/** Tarix qoidasi xatosini qator xatosiga aylantiradi. Boshqa xatolar (dastur xatosi) o'tkazib yuboriladi. */
export function withRuleErrors(r: RowReader, field: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof HistoryRuleError)) throw error;
    r.addError(field, error.message);
  }
}

export function failed(row: SheetRow, code: string | null, r: RowReader): RowOutcome {
  return { rowNumber: row.rowNumber, employeeCode: code, outcome: null, errors: r.errors };
}
