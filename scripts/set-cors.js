const { Storage } = require("@google-cloud/storage");
const serviceAccount = "/Users/davidjohnson/Downloads/earnest-page-firebase-adminsdk-fbsvc-52a2aced7e.json";

const storage = new Storage({
    keyFilename: serviceAccount
});

async function listBuckets() {
    try {
        const [buckets] = await storage.getBuckets();
        console.log("Buckets:");
        buckets.forEach(bucket => {
            console.log(bucket.name);
        });
    } catch (error) {
        console.error("Error listing buckets:", error);
    }
}

listBuckets();
