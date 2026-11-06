// Presentation helpers only. Native values arrive through the client's public Zero view.
export const ROOT_CONVERSATION_ID = 1;
export const agentOf = (conversation) => conversation.docs["pi.agent"] ?? {};
