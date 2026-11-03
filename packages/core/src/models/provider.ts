export interface ModelRef {
	provider: string;
	modelId: string;
}

export interface IModelProvider {
	resolveModel(ref?: { provider?: string; model?: string; thinking?: string }): Promise<{ model?: ModelRef; thinkingLevel?: string }>;
	getAvailableModels?(): Promise<ModelRef[]>;
}
