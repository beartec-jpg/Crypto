declare module 'pg' {
  export class Pool {
    constructor(config?: {
      connectionString?: string;
      ssl?: boolean | { rejectUnauthorized?: boolean };
    });
    query<T = any>(text: string, values?: any[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
