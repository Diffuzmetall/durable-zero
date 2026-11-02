import type { RuntimeGraphSnapshot } from "./types.ts";
export interface ConversationScopeRecord {
    readonly id: number;
    readonly owner?: {
        readonly conversationId: number;
        readonly taskId: number;
    };
    readonly parent?: {
        readonly conversationId: number;
        readonly at: number;
    };
}
/**
 * Checks if a conversation is in scope for the given target conversation.
 * Root conversation (1) sees all child conversations in the session.
 * A child conversation sees itself and any conversations owned (transitively) by its tasks.
 * Fork parent edges (`parent`) are NOT ownership edges and do not confer scope.
 */
export declare function isConversationInScope(conversationId: number, targetConversationId: number, conversations: Map<number, ConversationScopeRecord>): boolean;
/**
 * Filters a complete session snapshot down to the scope of a specific conversation.
 */
export declare function filterSnapshotForConversation(snapshot: RuntimeGraphSnapshot, targetConversationId: number | string): RuntimeGraphSnapshot;
