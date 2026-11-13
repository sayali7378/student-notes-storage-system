
const LAMBDA_URL = "https://h7sfbtxsi6vhri6rc56bed64ka0ctlro.lambda-url.ap-south-1.on.aws/";

const COGNITO_DOMAIN = "https://ap-south-1bxfzseq3x.auth.ap-south-1.amazoncognito.com";

const CLIENT_ID = "3tobsrisnh6bdvoq0oap2lh5gd";

// Updated Amplify website URL
const REDIRECT_URI = "https://staging.d3hs24dgnmcmgy.amplifyapp.com";

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
let accessToken = null;


// Generate random PKCE values
function randomString(length = 64) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}


// Convert bytes to Base64 URL format
function base64UrlEncode(bytes) {
    let binary = "";

    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}


// Create PKCE challenge
async function createCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);

    const digest = await crypto.subtle.digest("SHA-256", data);

    return base64UrlEncode(new Uint8Array(digest));
}


// Redirect user to Cognito login
async function startLogin() {
    const verifier = randomString();
    const state = randomString(32);

    sessionStorage.setItem("pkce_verifier", verifier);
    sessionStorage.setItem("oauth_state", state);

    const challenge = await createCodeChallenge(verifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        scope: "openid email",
        redirect_uri: REDIRECT_URI,
        state: state,
        code_challenge_method: "S256",
        code_challenge: challenge
    });

    window.location.href =
        COGNITO_DOMAIN + "/oauth2/authorize?" + params.toString();
}


// Exchange authorization code for tokens
async function exchangeCodeForToken(code) {
    const verifier = sessionStorage.getItem("pkce_verifier");
    const savedState = sessionStorage.getItem("oauth_state");

    const currentUrl = new URL(window.location.href);
    const returnedState = currentUrl.searchParams.get("state");

    if (!verifier || !savedState || returnedState !== savedState) {
        throw new Error("Invalid login session. Please sign in again.");
    }

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier
    });

    const response = await fetch(
        COGNITO_DOMAIN + "/oauth2/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body.toString()
        }
    );

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        throw new Error(
            data.error_description || "Token exchange failed."
        );
    }

    accessToken = data.access_token;

    sessionStorage.setItem("cognito_access_token", accessToken);

    sessionStorage.setItem(
        "token_expiry",
        String(Date.now() + data.expires_in * 1000)
    );

    sessionStorage.removeItem("pkce_verifier");
    sessionStorage.removeItem("oauth_state");

    // Remove authorization code from browser address
    currentUrl.searchParams.delete("code");
    currentUrl.searchParams.delete("state");
    currentUrl.searchParams.delete("session_state");

    window.history.replaceState(
        {},
        document.title,
        currentUrl.pathname
    );
}


// Check login and initialize the application
async function initializeApp() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");

    if (oauthError) {
        throw new Error(
            url.searchParams.get("error_description") || oauthError
        );
    }

    if (code) {
        await exchangeCodeForToken(code);
    } else {
        accessToken = sessionStorage.getItem("cognito_access_token");

        const expiry = Number(
            sessionStorage.getItem("token_expiry") || 0
        );

        if (!accessToken || Date.now() >= expiry) {
            sessionStorage.removeItem("cognito_access_token");
            sessionStorage.removeItem("token_expiry");

            await startLogin();
            return false;
        }
    }

    addSignOutButton();

    return true;
}


// Sign out from application and Cognito
function signOut() {
    sessionStorage.clear();

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        logout_uri: REDIRECT_URI
    });

    window.location.href =
        COGNITO_DOMAIN + "/logout?" + params.toString();
}


// Add a sign-out button
function addSignOutButton() {
    const header = document.querySelector("header");

    if (!header || document.getElementById("signOutButton")) {
        return;
    }

    const button = document.createElement("button");

    button.id = "signOutButton";
    button.textContent = "Sign Out";
    button.onclick = signOut;

    header.appendChild(button);
}


// Send authenticated requests to Lambda
async function authenticatedFetch(url, options = {}) {
    options.headers = {
        ...(options.headers || {}),
        "Authorization": "Bearer " + accessToken
    };

    const response = await fetch(url, options);

    if (response.status === 401) {
        sessionStorage.removeItem("cognito_access_token");
        sessionStorage.removeItem("token_expiry");

        alert("Your login session expired. Please sign in again.");

        await startLogin();
    }

    return response;
}


// Retrieve notes from AWS
async function showNotes(subject) {
    selectedSubject = subject;
    currentNotes = [];

    document.getElementById("searchInput").value = "";

    const notesList = document.getElementById("notesList");

    notesList.innerHTML = "<p>Loading files from AWS...</p>";

    try {
        const response = await authenticatedFetch(
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

        const extension =
            "." + note.filename.split(".").pop().toLowerCase();

        link.textContent =
            extension === ".pdf"
                ? "📄 " + note.filename
                : "🖼️ " + note.filename;

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
        return note.filename.toLowerCase().includes(searchText);
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

    const extension =
        "." + file.name.split(".").pop().toLowerCase();

    const contentType = allowedTypes[extension];

    if (!contentType || file.type !== contentType) {
        alert("Please select PDF, JPG, JPEG, PNG or WEBP files only.");
        return;
    }

    button.disabled = true;
    status.textContent = "Connecting to AWS...";

    try {
        const response = await authenticatedFetch(LAMBDA_URL, {
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

        await showNotes(selectedSubject);

    } catch (error) {
        console.error("Upload error:", error);

        status.textContent = "Upload failed: " + error.message;

        alert("Upload failed: " + error.message);

    } finally {
        button.disabled = false;
    }
}


// Start application only after login
initializeApp().catch(function(error) {
    console.error("Authentication error:", error);

    const notesList = document.getElementById("notesList");

    if (notesList) {
        notesList.innerHTML =
            "<p>Login error: " + error.message + "</p>";
    }
});
