import { Timestamp } from "firebase/firestore";

// Collection: master_actions
// Usage: A backlog of potential actions.
export interface MasterAction {
    id: string;
    title: string;
    excitement_score: number; // 1-10
    created_at: Timestamp;
}
