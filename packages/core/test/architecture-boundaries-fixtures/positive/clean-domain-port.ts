// Positive fixture: Pure TypeScript domain port
export interface CleanDomainPort {
  execute(id: string): Promise<string>;
}
