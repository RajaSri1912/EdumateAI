/**
 * Google Drive API Helper
 */

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API_URL = "https://www.googleapis.com/upload/drive/v3/files";

export const getOrCreateEduMateFolder = async (accessToken: string) => {
    try {
        // Search for existing folder
        const searchRes = await fetch(
            `${DRIVE_API_URL}?q=name='EduMate AI' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            {
                headers: { Authorization: `Bearer ${accessToken}` }
            }
        );

        if (searchRes.status === 401) {
            throw new Error("Unauthorized: Google Drive session expired.");
        }

        const searchData = await searchRes.json();

        if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
        }

        // Create new folder if not found
        const createRes = await fetch(DRIVE_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "EduMate AI",
                mimeType: "application/vnd.google-apps.folder"
            })
        });

        if (createRes.status === 401) {
            throw new Error("Unauthorized: Google Drive session expired.");
        }

        const folder = await createRes.json();
        return folder.id;
    } catch (error) {
        console.error("Error with Google Drive folder:", error);
        throw error;
    }
};

export const uploadToGoogleDrive = async (
    file: File,
    accessToken: string,
    folderId: string,
    onProgress?: (progress: number) => void
): Promise<string> => {
    const metadata = {
        name: file.name,
        parents: [folderId]
    };

    const formData = new FormData();
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    formData.append("file", file);

    // Using XMLHttpRequest for progress tracking (fetch doesn't support upload progress yet standardly)
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${UPLOAD_API_URL}?uploadType=multipart`);
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                const percentComplete = (event.loaded / event.total) * 100;
                onProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 401) {
                reject(new Error("Unauthorized: Google Drive session expired."));
            } else if (xhr.status >= 200 && xhr.status < 300) {
                const response = JSON.parse(xhr.responseText);
                resolve(response.id);
            } else {
                reject(new Error(`Drive upload failed with status ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error("Drive upload network error"));
        xhr.send(formData);
    });
};
