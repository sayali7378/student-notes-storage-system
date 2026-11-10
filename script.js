
const LAMBDA_URL =
    "https://h7sfbtxsi6vhri6rc56bed64ka0ctlro.lambda-url.ap-south-1.on.aws/";

const subjects = [
    "DevOps",
    "Deep Learning",
    "Industrial 4.0",
    "Cyber Security",
    "Data Science"
];

const allowedTypes = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
};

let selectedSubject = "";
let currentNotes = [];

// Retrieve notes from AWS
async function showNotes(subject) {

    selectedSubject = subject;
    currentNotes = [];

    document.getElementById("searchInput").value = "";

    const notesList = document.getElementById("notesList");

    notesList.innerHTML = "<p>Loading files from AWS...</p>";

    try {

        const response = await fetch(
            LAMBDA_URL + "?subject=" + encodeURIComponent(subject)
        );

        if (!response.ok) {
            throw new Error("Unable to retrieve files.");
        }

        const data = await response.json();

        currentNotes = data.notes || [];

        displayNotes(currentNotes);

    } catch (error) {

        console.error("Loading error:", error);

        notesList.innerHTML =
            "<p>Unable to load notes. Please check your connection.</p>";
    }
}


// Display PDF and image files
function displayNotes(noteList) {

    const notesList = document.getElementById("notesList");

    notesList.innerHTML = "";

    if (noteList.length === 0) {

        notesList.innerHTML =
            "<p>No files found in this subject.</p>";

        return;
    }

    noteList.forEach(function(note) {

        const item = document.createElement("p");

        const link = document.createElement("a");

        const extension = "." + note.filename.split(".").pop().toLowerCase();

        if (extension === ".pdf") {
            link.textContent = "📄 " + note.filename;
        } else {
            link.textContent = "🖼️ " + note.filename;
        }

        link.href = note.download_url;

        link.target = "_blank";

        link.rel = "noopener noreferrer";

        item.appendChild(link);

        notesList.appendChild(item);

    });
}


// Search files
function searchNotes() {

    if (!selectedSubject) {
        return;
    }

    const searchText = document
        .getElementById("searchInput")
        .value.toLowerCase();

    const filteredNotes = currentNotes.filter(function(note) {

        return note.filename
            .toLowerCase()
            .includes(searchText);

    });

    displayNotes(filteredNotes);
}


// Upload PDF and images to AWS S3
async function uploadNotes() {

    const fileInput = document.getElementById("fileInput");

    const file = fileInput.files[0];

    const button = document.getElementById("uploadButton");

    const status = document.getElementById("uploadStatus");

    if (!selectedSubject) {

        alert("Please select a subject first.");

        return;
    }

    if (!file) {

        alert("Please select a file.");

        return;
    }

    const extension = "." + file.name.split(".").pop().toLowerCase();

    const contentType = allowedTypes[extension];

    if (!contentType || file.type !== contentType) {

        alert("Please select PDF, JPG, JPEG, PNG or WEBP files only.");

        return;
    }

    button.disabled = true;

    status.textContent = "Connecting to AWS...";

    try {

        // Request temporary upload URL from Lambda
        const response = await fetch(LAMBDA_URL, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                subject: selectedSubject,

                filename: file.name,

                content_type: contentType

            })

        });

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Unable to generate upload link."
            );
        }

        status.textContent = "Uploading file to AWS S3...";

        // Upload file directly to S3
        const uploadResponse = await fetch(data.upload_url, {

            method: "PUT",

            headers: {
                "Content-Type": contentType
            },

            body: file

        });

        if (!uploadResponse.ok) {

            throw new Error("S3 upload failed.");
        }

        status.textContent = "File uploaded successfully!";

        alert("File uploaded successfully to AWS S3!");

        fileInput.value = "";

        // Refresh files after upload
        await showNotes(selectedSubject);

    } catch (error) {

        console.error("Upload error:", error);

        status.textContent = "Upload failed: " + error.message;

        alert("Upload failed: " + error.message);

    } finally {

        button.disabled = false;
    }
}



