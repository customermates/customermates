import { PrismaPg } from "@prisma/adapter-pg";

type Driver = Awaited<ReturnType<PrismaPg["connect"]>>;
type Transaction = Awaited<ReturnType<Driver["startTransaction"]>>;

export function serializeTransaction(transaction: Transaction): Transaction {
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const turn = tail.then(work, work);
    tail = turn.catch(() => undefined);
    return turn;
  };
  return Object.assign(Object.create(transaction) as Transaction, {
    queryRaw: (query: Parameters<Transaction["queryRaw"]>[0]) => inTurn(() => transaction.queryRaw(query)),
    executeRaw: (query: Parameters<Transaction["executeRaw"]>[0]) => inTurn(() => transaction.executeRaw(query)),
    commit: () => inTurn(() => transaction.commit()),
    rollback: () => inTurn(() => transaction.rollback()),
  });
}

export function serializedPgAdapter(connectionString: string) {
  const factory = new PrismaPg({ connectionString });
  const connect = factory.connect.bind(factory);
  factory.connect = async () => {
    const driver = await connect();
    const startTransaction = driver.startTransaction.bind(driver);
    driver.startTransaction = async (isolationLevel) => serializeTransaction(await startTransaction(isolationLevel));
    return driver;
  };
  return factory;
}
