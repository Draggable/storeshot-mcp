export const MCP_ROOT: string;
export const IN_MONOREPO: boolean;
export const INPUTS: Readonly<{ contract: string }>;
export function monorepoPath(rel: string): string;
export function inputPath(name: 'contract'): string;
