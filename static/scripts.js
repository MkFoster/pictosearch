const video = document.querySelector('.player');
const canvas = document.querySelector('.monitor');
const title = document.querySelector('.title');
const ctx = canvas.getContext('2d');
const strip = document.querySelector('.strip');
const analyzeImageEndpoint = ``;
const okButton = document.querySelector('#ok');
const noButton = document.querySelector('#no');
const shutterButton = document.querySelector('#shutter-button');
const addLogoStickerButton = document.querySelector('#add-logo-sticker');
const gamestatus = document.querySelector('#gamestatus');
const placeholderSticker = document.querySelector('#placeholder-sticker');
let faceData;
let currentEmotion;
let faceOutlines;
let vidInterval;
let paintInterval;
let addLogoSticker = false;

video.addEventListener('canplay', paintToCanvas);
okButton.addEventListener('click', getVideo);
shutterButton.addEventListener('click', takePhoto);

function drawRectangle(rectangle, color, lineWidth) {
    let boundingPoints = {};
    boundingPoints.topLeftX = rectangle.left;
    boundingPoints.topLeftY = rectangle.top;

    boundingPoints.topRightX = rectangle.left + rectangle.width;
    boundingPoints.topRightY = rectangle.top;

    boundingPoints.bottomLeftX = rectangle.left;
    boundingPoints.bottomLeftY = rectangle.top + rectangle.height;

    boundingPoints.bottomRightX = rectangle.left + rectangle.width;
    boundingPoints.bottomRightY = rectangle.top + rectangle.height;

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;

    // !Important Note: If you don't use ctx.beginPath() and ctx.closePath() stroke color and width on 
    // previously drawn lines will be changed to the last new line style
    ctx.beginPath();
    ctx.moveTo(boundingPoints.topLeftX, boundingPoints.topLeftY);
    ctx.lineTo(boundingPoints.topRightX, boundingPoints.topRightY);
    ctx.lineTo(boundingPoints.bottomRightX, boundingPoints.bottomRightY);
    ctx.lineTo(boundingPoints.bottomLeftX, boundingPoints.bottomRightY);
    ctx.lineTo(boundingPoints.topLeftX, boundingPoints.topRightY);
    ctx.stroke();
    ctx.closePath();
}

function getVideo() {
    navigator.mediaDevices.getUserMedia({ video: { width: 800, height: 600 }, audio: false })
        .then(localMediaStream => {
            video.srcObject = localMediaStream;
            video.play();
            landingScreen.style.display = 'none';
            cameraScreen.style.display = 'grid';
        })
        .catch(err => {
            console.error(`OH NO!!`, err);
            alert(`Sorry. PhotoBoothAI is having a bit of trouble getting your webcam up.  If you are on Windows make sure that your browser has 
 permission to use your webcam in "Camera Privacy Settings". Make sure your webcam isn't already in use and when your
 browser prompts you, click "Allow" to allow the browser to use your webcam for this site.`);
        });
}

function paintToCanvas() {
    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;

    paintInterval = setInterval(() => {
        ctx.drawImage(video, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height);
        ctx.putImageData(pixels, 0, 0);
        if (addLogoSticker) {
            ctx.drawImage(placeholderSticker, 10, 10);
        }
    }, 100);
}

async function takePhoto() {
    clearInterval(paintInterval);
    var audio = new Audio('assets/shutter.mp3');
    audio.play();
    const data = canvas.toDataURL('image/jpeg');
    let uuid = uuidv4();
    let blobName = `${uuid}.jpg`;
    const uploadResponse = await upload(dataURLToBlob(data), blobName);
    gamestatus.innerHTML = `Calling Azure function that calls Azure Face and Custom Vision APIs...`;
    const photoMetadata = await analyzeImage(uuid);
    let smileScore = 0;
    photoMetadata.FaceData.map(face => {
        //If we see a smile on that face increment the smile score!
        if (face.faceAttributes.smile > 0.4) {
            drawRectangle(face.faceRectangle, `rgba(255,0,255,0.8)`, 4);
            smileScore++;
        }
    });
    let logoScore = 0;
    photoMetadata.LogoData.predictions.map(prediction => {
        if (prediction.probability > .80) {
            const translatedRectangle = {
                left: Math.round(canvas.width * prediction.boundingBox.left),
                top: Math.round(canvas.height * prediction.boundingBox.top),
                width: Math.round(canvas.width * prediction.boundingBox.width),
                height: Math.round(canvas.height * prediction.boundingBox.height),
            }
            drawRectangle(translatedRectangle, `rgba(255,255,0,0.8)`, 4);
            logoScore++;
        }
    });
    const smileDisplayScore = smileScore * 1000; // 'cause video games have to have scores in the thousands ;)
    const logoDisplayScore = logoScore * 1000;
    const totalScore = smileDisplayScore + logoDisplayScore;
    let scoreAudio;
    if (totalScore > 0) {
        scoreAudio = new Audio('assets/score.mp3');
    } else {
        scoreAudio = new Audio('assets/noscore.mp3');
    }
    scoreAudio.play();
    let emoji;
    if (totalScore < 1) {
        emoji = '&#128577';
    } else if ((totalScore > 1) && (totalScore < 2000)) {
        emoji = '&#128578';
    } else if (totalScore >= 2000) {
        emoji = '&#128515';
    }
    gamestatus.innerHTML = `Done! Your Score: ${totalScore} ${emoji}`;
    const annotatedPhoto = canvas.toDataURL('image/jpeg');
    const link = document.createElement('a');
    link.href = annotatedPhoto;
    link.setAttribute('download', 'portrait.jpg');
    link.innerHTML = `<div class="snap"><img src="${annotatedPhoto}" alt="Portrait" /><div class="snap-caption">Score: ${totalScore}</div></div>`;
    strip.insertBefore(link, strip.firstChild);
    setTimeout(paintToCanvas, 2000);
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/* Utility function to convert a canvas to a BLOB */
function dataURLToBlob(dataURL) {
    var BASE64_MARKER = ';base64,';
    if (dataURL.indexOf(BASE64_MARKER) == -1) {
        var parts = dataURL.split(',');
        var contentType = parts[0].split(':')[1];
        var raw = parts[1];

        return new Blob([raw], { type: contentType });
    }

    var parts = dataURL.split(BASE64_MARKER);
    var contentType = parts[0].split(':')[1];
    var raw = window.atob(parts[1]);
    var rawLength = raw.length;

    var uInt8Array = new Uint8Array(rawLength);

    for (var i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
}

function blobToFile(theBlob, fileName) {
    //A Blob() is almost a File() - it's just missing the two properties below which we will add
    theBlob.lastModifiedDate = new Date();
    theBlob.name = fileName;
    return theBlob;
}

async function getSasUrlPromise(blobName, contentType) {
    let url = `https://mk-azure-upload.azurewebsites.net/api/azure-sas?code=5YOXZjWIeb5LC65c9WICbE3DNj6NfdhyfUABN0UXEAk9o/xAyYGJYg==`;
    return await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                container: 'photoboothai',
                blobName: blobName
            }),
            headers: {
                "Content-Type": contentType
            }
        })
        .then(
            response => response.json() // if the response is a JSON object
        ).catch(
            error => console.log(error) // Handle the error response object
        );
}

// This will upload the file after having read it
async function upload(imageBlob, blobName) {
    //Upload the image
    const file = blobToFile(imageBlob, 'inputimage.jpg');
    gamestatus.innerHTML = `Getting an shared access signature URL for upload from Azure function...`;
    const sasUri = sasUriObj.uri;
    gamestatus.innerHTML = `Uploading your image to Azure Storage for processsing...`;
    const mkAzureUpload = await fetch(sasUri, {
            method: 'PUT',
            body: file,
            headers: {
                "Content-Type": "image/jpeg",
                "x-ms-blob-type": "BlockBlob"
            }
        })
        .then(() => true)
        .catch(error => console.log(error));
};

//Calls Microsoft Face API and shows estimated ages of detected faces
async function analyzeImage(uuid) {
    const analyzeImageUrl = `${analyzeImageEndpoint}&uuid=${uuid}`;
    const response = await fetch(analyzeImageUrl);
    const data = await response.json();
    return data;
}