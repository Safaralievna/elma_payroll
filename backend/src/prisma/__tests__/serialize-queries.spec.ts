import { serializeQueries } from '../serialize-queries';

/** Bir vaqtda nechta so'rov bajarilayotganini sanaydigan soxta pg klienti. */
function fakeClient(delays: number[], failAt: number | null = null) {
  let running = 0;
  let maxRunning = 0;
  let call = 0;
  const finished: number[] = [];
  const client = {
    query: async (_text: string) => {
      const index = call++;
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, delays[index] ?? 0));
      running -= 1;
      finished.push(index);
      if (index === failAt) throw new Error(`so'rov ${index} xato`);
      return { index };
    },
  };
  return { client, stats: () => ({ maxRunning, finished }) };
}

describe('serializeQueries — bitta klientda parallel so\'rovlar ketma-ket bajariladi', () => {
  it('asl klient parallel chaqiruvda bir vaqtda bir nechta so\'rov bajaradi (muammo)', async () => {
    const { client, stats } = fakeClient([30, 10, 0]);
    await Promise.all([client.query('a'), client.query('b'), client.query('c')]);
    expect(stats().maxRunning).toBe(3);
  });

  it('o\'rovdan keyin bir vaqtda faqat bitta so\'rov; tartib va natijalar saqlanadi', async () => {
    const { client, stats } = fakeClient([30, 10, 0]);
    serializeQueries(client);
    const results = await Promise.all([client.query('a'), client.query('b'), client.query('c')]);
    expect(results).toEqual([{ index: 0 }, { index: 1 }, { index: 2 }]);
    expect(stats().maxRunning).toBe(1);
    expect(stats().finished).toEqual([0, 1, 2]);
  });

  it('xato faqat o\'z so\'roviga qaytadi, keyingilar bajariladi (zanjir uzilmaydi)', async () => {
    const { client, stats } = fakeClient([0, 0, 0], 1);
    serializeQueries(client);
    const settled = await Promise.allSettled([client.query('a'), client.query('b'), client.query('c')]);
    expect(settled.map((item) => item.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect((settled[1] as PromiseRejectedResult).reason.message).toBe("so'rov 1 xato");
    expect(stats().finished).toEqual([0, 1, 2]);
  });

  it('ketma-ket (parallel bo\'lmagan) chaqiruvlar odatdagidek ishlaydi', async () => {
    const { client } = fakeClient([0, 0]);
    serializeQueries(client);
    expect(await client.query('a')).toEqual({ index: 0 });
    expect(await client.query('b')).toEqual({ index: 1 });
  });
});
