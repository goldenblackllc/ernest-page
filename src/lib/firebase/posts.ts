import { db } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Belief, Rule } from "@/hooks/useProblemWizard";

export async function createPost(
    uid: string,
    rant: string,
    beliefs: Belief[],
    rules: Rule[],
    actions: string[]
) {
    if (!uid) throw new Error("User ID is required");

    // Format for Feed Display
    const postData = {
        uid,
        type: 'recast',
        rant,
        core_beliefs: beliefs.map(b => ({ negative: b.negative, positive: b.positive })),
        new_rules: rules.map(r => ({ title: r.title, description: r.description })),
        actions: actions,
        created_at: serverTimestamp(),
        likes: 0,
        comments: 0
    };

    const docRef = await addDoc(collection(db, "posts"), postData);
    return docRef.id;
}
