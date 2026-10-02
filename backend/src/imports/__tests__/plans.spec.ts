import { Decimal } from '../../calculation/decimal';
import { SheetRow } from '../excel/sheet';
import { CatalogImportContext, planClientRows, planProductRows } from '../plans/catalog.plan';
import { EmployeeImportContext, EmployeeState, planEmployeeRows } from '../plans/employees.plan';
import { planTeamLinkRows, seriesKey, TeamLinkImportContext } from '../plans/team-links.plan';
import { changedRecords, idGenerator, TeamLinkPayload, TrackedRecord } from '../plans/tracked-history';

function rows(...values: Record<string, unknown>[]): SheetRow[] {
  return values.map((value, index) => ({ rowNumber: index + 2, values: value as SheetRow['values'] }));
}

function tracked<P>(id: number, startDate: string, endDate: string | null, valueKey: string, payload: P): TrackedRecord<P> {
  return { id: BigInt(id), startDate, endDate, valueKey, payload, isNew: false, originalEndDate: endDate };
}

// ---------------------------------------------------------------------------

describe('planEmployeeRows — EMPLOYEES importi', () => {
  function context(employees: EmployeeState[] = [], lastClosedDay: string | null = null): EmployeeImportContext {
    return {
      employees: new Map(employees.map((employee) => [employee.code, employee])),
      departments: new Map([
        ['SAVDO', { id: 10n, isActive: true }],
        ['ESKI', { id: 11n, isActive: false }],
      ]),
      positions: new Map([
        ['SALES_REP', { id: 20n, isActive: true }],
        ['SUPERVISOR', { id: 21n, isActive: true }],
      ]),
      rules: { lastClosedDay },
      newId: idGenerator(),
    };
  }

  function existing(code: string, overrides: Partial<EmployeeState> = {}): EmployeeState {
    const fields = { firstName: 'Ali', lastName: 'Valiyev', middleName: null, hireDate: '2025-01-10', terminationDate: null, isActive: true };
    return {
      id: 1n,
      code,
      fields: { ...fields },
      original: { ...fields },
      assignments: [tracked(100, '2026-01-01', null, '10:20', { departmentId: 10n, positionId: 20n })],
      salaries: [tracked(200, '2026-01-01', null, '3000000.00', { salaryAmount: new Decimal(3000000) })],
      teamLinks: [],
      ...overrides,
    };
  }

  it('yangi xodim: lavozim va oylik bilan — CREATED', () => {
    const ctx = context();
    const result = planEmployeeRows(
      rows({
        xodim_kodi: 'E100',
        familiya: 'Karimov',
        ism: 'Bobur',
        bolim_kodi: 'SAVDO',
        lavozim_kodi: 'SALES_REP',
        lavozim_sanasi: '2026-05-01',
        oylik: 3500000,
        oylik_sanasi: '01.05.2026',
      }),
      ctx,
    );
    expect(result).toEqual([{ rowNumber: 2, employeeCode: 'E100', outcome: 'CREATED', errors: [] }]);
    const state = ctx.employees.get('E100')!;
    expect(state).toMatchObject({ id: null, fields: { lastName: 'Karimov', firstName: 'Bobur', isActive: true } });
    expect(changedRecords(state.assignments).creates).toMatchObject([
      { startDate: '2026-05-01', endDate: null, payload: { departmentId: 10n, positionId: 20n } },
    ]);
    expect(changedRecords(state.salaries).creates[0].payload.salaryAmount.toFixed(2)).toBe('3500000.00');
  });

  it('lavozim o\'zgardi — eski yozuv yopiladi, yangisi qo\'shiladi; oylik bir xil — tegilmaydi', () => {
    const ctx = context([existing('E1')]);
    const result = planEmployeeRows(
      rows({
        xodim_kodi: 'E1',
        bolim_kodi: 'SAVDO',
        lavozim_kodi: 'SUPERVISOR',
        lavozim_sanasi: '2026-06-01',
        oylik: '3 000 000',
        oylik_sanasi: '2026-06-01',
      }),
      ctx,
    );
    expect(result[0]).toMatchObject({ outcome: 'UPDATED', errors: [] });
    const state = ctx.employees.get('E1')!;
    expect(changedRecords(state.assignments)).toMatchObject({
      updates: [{ id: 100n, endDate: '2026-05-31' }],
      creates: [{ startDate: '2026-06-01', payload: { positionId: 21n } }],
    });
    expect(changedRecords(state.salaries)).toEqual({ updates: [], creates: [] });
  });

  it('hamma narsa bazadagidek — UNCHANGED (bo\'sh katakcha qiymatni o\'chirmaydi)', () => {
    const ctx = context([existing('E1')]);
    const result = planEmployeeRows(rows({ xodim_kodi: 'E1', ism: 'Ali', familiya: null }), ctx);
    expect(result[0]).toMatchObject({ outcome: 'UNCHANGED', errors: [] });
    expect(ctx.employees.get('E1')!.fields.lastName).toBe('Valiyev');
  });

  it('ishdan ketgan sana: ochiq lavozim, oylik va team_links shu sanada yopiladi, isActive=false', () => {
    const link = tracked<TeamLinkPayload>(300, '2026-02-01', null, '5', { leaderId: 5n, memberId: 1n, linkType: 'SUPERVISOR' });
    const ctx = context([existing('E1', { teamLinks: [link] })]);
    const result = planEmployeeRows(rows({ xodim_kodi: 'E1', ishdan_ketgan_sana: '2026-05-20' }), ctx);
    expect(result[0]).toMatchObject({ outcome: 'UPDATED', errors: [] });
    const state = ctx.employees.get('E1')!;
    expect(state.fields).toMatchObject({ terminationDate: '2026-05-20', isActive: false });
    expect(changedRecords(state.assignments).updates).toEqual([expect.objectContaining({ id: 100n, endDate: '2026-05-20' })]);
    expect(changedRecords(state.salaries).updates).toEqual([expect.objectContaining({ id: 200n, endDate: '2026-05-20' })]);
    expect(link.endDate).toBe('2026-05-20');
  });

  it('bir qatorda yangi lavozim va ishdan ketish — yangi yozuv ishdan ketish sanasida tugaydi', () => {
    const ctx = context([existing('E1')]);
    planEmployeeRows(
      rows({ xodim_kodi: 'E1', bolim_kodi: 'SAVDO', lavozim_kodi: 'SUPERVISOR', lavozim_sanasi: '2026-05-01', ishdan_ketgan_sana: '2026-05-20' }),
      ctx,
    );
    expect(changedRecords(ctx.employees.get('E1')!.assignments)).toMatchObject({
      updates: [{ id: 100n, endDate: '2026-04-30' }],
      creates: [{ startDate: '2026-05-01', endDate: '2026-05-20' }],
    });
  });

  it('xatolar: takrorlangan kod, topilmagan/nofaol bo\'lim, to\'liq bo\'lmagan guruh, oyning 1-kuni emas', () => {
    const ctx = context([existing('E1')]);
    const result = planEmployeeRows(
      rows(
        { xodim_kodi: 'E2' },
        { xodim_kodi: 'E2' },
        { xodim_kodi: 'E3', bolim_kodi: 'YOQ', lavozim_kodi: 'SALES_REP', lavozim_sanasi: '2026-05-01' },
        { xodim_kodi: 'E4', bolim_kodi: 'ESKI', lavozim_kodi: 'SALES_REP', lavozim_sanasi: '2026-05-01' },
        { xodim_kodi: 'E5', oylik: 100 },
        { xodim_kodi: 'E1', oylik: 100, oylik_sanasi: '2026-05-15' },
        { xodim_kodi: 'E6', ishga_kirgan_sana: '2026-05-10', ishdan_ketgan_sana: '2026-05-01' },
      ),
      ctx,
    );
    const fieldsOf = (index: number) => result[index].errors.map((error) => error.field);
    expect(fieldsOf(0)).toEqual(['xodim_kodi']);
    expect(fieldsOf(1)).toEqual(['xodim_kodi']);
    expect(fieldsOf(2)).toEqual(['bolim_kodi']);
    expect(fieldsOf(3)).toEqual(['bolim_kodi']);
    expect(fieldsOf(4)).toEqual(['oylik_sanasi']);
    expect(result[5].errors).toEqual([{ field: 'oylik_sanasi', message: expect.stringContaining('1-kuni') }]);
    expect(fieldsOf(6)).toEqual(['ishdan_ketgan_sana']);
    expect(result.every((row) => row.outcome === null)).toBe(true);
  });

  it('yopilgan davrga tushadigan o\'zgarish — qator xatosi', () => {
    const ctx = context([existing('E1')], '2026-05-31');
    const result = planEmployeeRows(rows({ xodim_kodi: 'E1', oylik: 4000000, oylik_sanasi: '2026-05-01' }), ctx);
    expect(result[0].errors).toEqual([{ field: 'oylik_sanasi', message: expect.stringContaining('yopilgan') }]);
  });
});

// ---------------------------------------------------------------------------

describe('planTeamLinkRows — TEAM_LINKS importi', () => {
  function context(lastClosedDay: string | null = null): TeamLinkImportContext {
    return {
      employees: new Map([
        ['SUP1', { id: 1n, isActive: true }],
        ['SUP2', { id: 2n, isActive: true }],
        ['OP1', { id: 3n, isActive: true }],
        ['R1', { id: 10n, isActive: true }],
        ['OLD', { id: 11n, isActive: false }],
      ]),
      series: new Map([
        [seriesKey(10n, 'SUPERVISOR'), [tracked<TeamLinkPayload>(500, '2026-01-01', null, '1', { leaderId: 1n, memberId: 10n, linkType: 'SUPERVISOR' })]],
      ]),
      rules: { lastClosedDay },
      newId: idGenerator(),
    };
  }

  it('yangi rahbar istalgan kundan — eski havola bir kun oldin yopiladi; boshqa turdagi havola mustaqil', () => {
    const ctx = context();
    const result = planTeamLinkRows(
      rows(
        { rahbar_kodi: 'SUP2', xodim_kodi: 'R1', turi: 'supervisor', boshlanish_sanasi: '2026-05-15' },
        { rahbar_kodi: 'OP1', xodim_kodi: 'R1', turi: 'OPERATOR', boshlanish_sanasi: '2026-05-15' },
      ),
      ctx,
    );
    expect(result.map((row) => row.outcome)).toEqual(['CREATED', 'CREATED']);
    expect(changedRecords(ctx.series.get(seriesKey(10n, 'SUPERVISOR'))!)).toMatchObject({
      updates: [{ id: 500n, endDate: '2026-05-14' }],
      creates: [{ startDate: '2026-05-15', payload: { leaderId: 2n, memberId: 10n } }],
    });
    expect(changedRecords(ctx.series.get(seriesKey(10n, 'OPERATOR'))!).creates).toHaveLength(1);
  });

  it('bir xodimning bir nechta havolasi faylda aralash tartibda — sana bo\'yicha qo\'llanadi', () => {
    const ctx = context();
    const result = planTeamLinkRows(
      rows(
        { rahbar_kodi: 'SUP1', xodim_kodi: 'R1', turi: 'SUPERVISOR', boshlanish_sanasi: '2026-07-01' },
        { rahbar_kodi: 'SUP2', xodim_kodi: 'R1', turi: 'SUPERVISOR', boshlanish_sanasi: '2026-03-01', tugash_sanasi: '2026-06-30' },
      ),
      ctx,
    );
    expect(result.map((row) => [row.rowNumber, row.outcome])).toEqual([
      [2, 'CREATED'],
      [3, 'CREATED'],
    ]);
    const series = ctx.series.get(seriesKey(10n, 'SUPERVISOR'))!;
    expect(series.map((record) => [record.startDate, record.endDate, record.valueKey])).toEqual([
      ['2026-01-01', '2026-02-28', '1'],
      ['2026-03-01', '2026-06-30', '2'],
      ['2026-07-01', null, '1'],
    ]);
  });

  it('mavjud havola bilan bir xil — UNCHANGED', () => {
    const ctx = context();
    const result = planTeamLinkRows(rows({ rahbar_kodi: 'SUP1', xodim_kodi: 'R1', turi: 'SUPERVISOR', boshlanish_sanasi: '2026-01-01' }), ctx);
    expect(result[0]).toMatchObject({ outcome: 'UNCHANGED', errors: [] });
  });

  it('xatolar: o\'ziga o\'zi, noma\'lum/nofaol xodim, noto\'g\'ri tur, yopilgan davr', () => {
    const ctx = context('2026-04-30');
    const result = planTeamLinkRows(
      rows(
        { rahbar_kodi: 'R1', xodim_kodi: 'R1', turi: 'SUPERVISOR', boshlanish_sanasi: '2026-05-01' },
        { rahbar_kodi: 'YOQ', xodim_kodi: 'R1', turi: 'OPERATOR', boshlanish_sanasi: '2026-05-01' },
        { rahbar_kodi: 'OLD', xodim_kodi: 'R1', turi: 'OPERATOR', boshlanish_sanasi: '2026-05-01' },
        { rahbar_kodi: 'SUP1', xodim_kodi: 'R1', turi: 'BOSS', boshlanish_sanasi: '2026-05-01' },
        { rahbar_kodi: 'SUP2', xodim_kodi: 'R1', turi: 'SUPERVISOR', boshlanish_sanasi: '2026-04-15' },
      ),
      ctx,
    );
    expect(result.map((row) => row.errors.map((error) => error.field))).toEqual([
      ['rahbar_kodi'],
      ['rahbar_kodi'],
      ['rahbar_kodi'],
      ['turi'],
      ['boshlanish_sanasi'],
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('planProductRows / planClientRows — ma\'lumotnoma importi', () => {
  function context(): CatalogImportContext {
    return {
      items: new Map([['P1', { id: 1n, code: 'P1', name: 'Choy', parentId: 10n, original: { name: 'Choy', parentId: 10n } }]]),
      parents: new Map([
        ['ICHIMLIK', { id: 10n, isActive: true }],
        ['SHIRINLIK', { id: 11n, isActive: true }],
        ['ESKI', { id: 12n, isActive: false }],
      ]),
    };
  }

  it('mahsulot: yangi, o\'zgargan, o\'zgarmagan va xatolar', () => {
    const ctx = context();
    const result = planProductRows(
      rows(
        { mahsulot_kodi: 'P2', nomi: 'Shokolad', guruh_kodi: 'SHIRINLIK' },
        { mahsulot_kodi: 'P1', nomi: 'Ko\'k choy', guruh_kodi: 'ICHIMLIK' },
        { mahsulot_kodi: 'P3', nomi: 'X', guruh_kodi: 'ICHIMLIK' },
        { mahsulot_kodi: 'P3', nomi: 'X', guruh_kodi: 'ICHIMLIK' },
        { mahsulot_kodi: 'P4', nomi: 'Y', guruh_kodi: 'ESKI' },
        { mahsulot_kodi: 'P5', guruh_kodi: 'YOQ' },
      ),
      ctx,
    );
    expect(result.map((row) => row.outcome)).toEqual(['CREATED', 'UPDATED', null, null, null, null]);
    expect(result[4].errors.map((error) => error.field)).toEqual(['guruh_kodi']);
    expect(result[5].errors.map((error) => error.field)).toEqual(['nomi', 'guruh_kodi']);
    expect(ctx.items.get('P1')).toMatchObject({ name: "Ko'k choy", parentId: 10n });
    expect(ctx.items.get('P2')).toMatchObject({ id: null, name: 'Shokolad', parentId: 11n });

    const again = context();
    expect(planProductRows(rows({ mahsulot_kodi: 'P1', nomi: 'Choy', guruh_kodi: 'ICHIMLIK' }), again)[0].outcome).toBe('UNCHANGED');
  });

  it('mijoz: kategoriya ixtiyoriy; bo\'sh kategoriya mavjudini o\'chirmaydi', () => {
    const ctx: CatalogImportContext = {
      items: new Map([['C1', { id: 1n, code: 'C1', name: 'Do\'kon', parentId: 10n, original: { name: 'Do\'kon', parentId: 10n } }]]),
      parents: new Map([['VIP', { id: 10n, isActive: true }]]),
    };
    const result = planClientRows(
      rows({ mijoz_kodi: 'C1', nomi: "Do'kon" }, { mijoz_kodi: 'C2', nomi: 'Market' }, { mijoz_kodi: 'C3', nomi: 'Z', kategoriya_kodi: 'YOQ' }),
      ctx,
    );
    expect(result.map((row) => row.outcome)).toEqual(['UNCHANGED', 'CREATED', null]);
    expect(ctx.items.get('C2')).toMatchObject({ parentId: null });
  });
});
