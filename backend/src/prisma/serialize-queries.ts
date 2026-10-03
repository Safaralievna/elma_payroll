/**
 * Bitta pg klientida so'rovlarni ketma-ket bajaradi.
 *
 * Nega kerak: Prisma 7 bir nechta bog'liq jadvalni `include` qilgan so'rovni (masalan, qoida →
 * pog'onalar + filtrlar) tranzaksiyada bolalar so'rovlariga bo'lib, `Promise.all` bilan bir
 * klientda parallel yuboradi. `pg` buni ichki navbatda baribir ketma-ket bajaradi, lekin
 * "client.query() when the client is already executing a query" deprecation ogohlantirishini
 * beradi va `pg@9` da olib tashlanadi. Zanjir shu navbatni ochiq qiladi: natija bir xil,
 * ogohlantirish yo'q. Xato faqat o'z so'roviga qaytadi — zanjir uzilmaydi.
 */
interface QueryClient {
  query: (...args: never[]) => unknown;
}

export function serializeQueries(client: QueryClient): void {
  const original = client.query.bind(client) as (...args: unknown[]) => unknown;
  let tail: Promise<unknown> = Promise.resolve();
  (client as { query: unknown }).query = (...args: unknown[]) => {
    // Callback uslubi (pg o'zi navbatlaydi) — Prisma ishlatmaydi, o'zgarishsiz.
    if (typeof args[args.length - 1] === 'function') return original(...args);
    const run = tail.then(() => original(...args));
    tail = run.catch(() => undefined);
    return run;
  };
}
