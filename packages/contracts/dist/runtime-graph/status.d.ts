import type { RuntimeTaskReceipt, RuntimeTaskState, ProjectedTaskState, ProjectedReceiptState, BlockedTaskReason } from "./types.ts";
export declare function projectTaskState(input: {
    state: RuntimeTaskState;
    abortRequested?: boolean;
    blocked?: BlockedTaskReason;
    label?: string;
}): ProjectedTaskState;
export declare function projectTaskReceipt(receipt: RuntimeTaskReceipt): ProjectedReceiptState;
