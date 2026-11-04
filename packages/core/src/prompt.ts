export interface ResourceLoaderLike {
	getAgentsFiles?: () => { agentsFiles: Array<{ path: string; content: string }> };
	getSkills?: () => { skills: Array<{ name: string; description: string; content?: string }> };
}

export interface DynamicSectionsHolder {
	getSections(): Record<string, string>;
	updateSections(sections: Record<string, string>): void;
	getRevision?(): number;
}

export class DynamicPromptSections implements DynamicSectionsHolder {
	private sections: Record<string, string> = {};
	private revision = 0;
	getSections(): Record<string, string> {
		return { ...this.sections };
	}
	updateSections(sections: Record<string, string>): void {
		this.sections = { ...sections };
		this.revision++;
	}
	getRevision(): number {
		return this.revision;
	}
}

export interface PromptOptions {
	systemPromptPath?: string;
	appendSystemPromptPath?: string;
	contextFiles?: Array<{ path: string; content: string }>;
	resourceLoader?: ResourceLoaderLike;
	dynamicSections?: DynamicSectionsHolder;
}
