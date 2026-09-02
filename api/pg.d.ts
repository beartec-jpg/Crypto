declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
    min?: number;
    idleTimeoutMillis?: number | null;
    connectionTimeoutMillis?: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = any>(text: string, values?: any[]): Promise<{ rows: T[] }>;
    on(event: string, listener: (...args: any[]) => void): this;
    end(): Promise<void>;
  }
}
