declare module 'pg' {
  export class Pool {
    constructor(config?: { connectionString?: string });
    query(text: string, values?: any[]): Promise<{ rows: any[] }>;
    end(): Promise<void>;
  }
}
