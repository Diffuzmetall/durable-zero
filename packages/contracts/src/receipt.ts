export interface TextContentPart {
	readonly type: "text";
	readonly text: string;
}

export interface ImageContentPart {
	readonly type: "image";
	readonly data: string;
	readonly mimeType: string;
}

export type PromptContentPart = TextContentPart | ImageContentPart;
export type PromptInput = string | readonly PromptContentPart[];

export interface PromptAdmissionReceipt {
	readonly status: "accepted";
	readonly id: string; // Native requestId (SubmissionId) from Harness submission
	readonly conversationId: string; // Canonical "1" for root
	readonly sequence?: number;
}
