export type ConnectionProvider = {
  id: string;
  name: string;
  enablesKey: string;
  available: boolean;
};

export const CONNECTION_PROVIDERS: readonly ConnectionProvider[] = [];
