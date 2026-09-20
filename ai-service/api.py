from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from ultralytics import YOLO
from pathlib import Path
import shutil
import uuid
import base64
import cv2


# ============================================================
# LINE 1-8: Create FastAPI application
# ============================================================

app = FastAPI(
    title="GreenEye AI Service",
    description="YOLO26 litter detection service",
    version="1.0"
)


# ============================================================
# LINE 11-18: Load trained GreenEye model
# ============================================================

MODEL_PATH = Path("models/greeneye_litter.pt")

print("Loading GreenEye YOLO model...")

model = YOLO(str(MODEL_PATH))

print("GreenEye YOLO model loaded successfully.")


# ============================================================
# LINE 21-25: Create folders
# ============================================================

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

VIDEO_DIR = Path("videos")
VIDEO_DIR.mkdir(exist_ok=True)


# ============================================================
# LINE 28-30: Health check
# ============================================================

@app.get("/health")
def health():

    return {
        "ok": True,
        "service": "GreenEye AI",
        "model": "YOLO26n",
        "classes": ["litter"]
    }


# ============================================================
# LINE 33-70: Litter detection endpoint
# ============================================================

@app.post("/detect")
async def detect_litter(
    file: UploadFile = File(...)
):

    try:

        # ----------------------------------------------------
        # Save uploaded image
        # ----------------------------------------------------

        extension = Path(file.filename).suffix or ".jpg"

        filename = f"{uuid.uuid4()}{extension}"

        image_path = UPLOAD_DIR / filename

        with open(image_path, "wb") as buffer:

            shutil.copyfileobj(
                file.file,
                buffer
            )


        # ----------------------------------------------------
        # Run YOLO detection
        # ----------------------------------------------------

        results = model(
            str(image_path),
            conf=0.40,
            imgsz=416,
            verbose=False
        )


        result = results[0]

        detections = []


        # ----------------------------------------------------
        # Extract detections
        # ----------------------------------------------------

        if result.boxes is not None:

            for box in result.boxes:

                confidence = float(
                    box.conf[0]
                )

                class_id = int(
                    box.cls[0]
                )

                coordinates = (
                    box.xyxy[0]
                    .cpu()
                    .tolist()
                )


                detections.append({

                    "class": result.names[class_id],

                    "confidence": round(
                        confidence,
                        3
                    ),

                    "box": {
                        "x1": round(
                            coordinates[0],
                            2
                        ),

                        "y1": round(
                            coordinates[1],
                            2
                        ),

                        "x2": round(
                            coordinates[2],
                            2
                        ),

                        "y2": round(
                            coordinates[3],
                            2
                        )
                    }

                })


        # ----------------------------------------------------
        # Return response
        # ----------------------------------------------------

        return {

            "success": True,

            "litterDetected":
                len(detections) > 0,

            "count":
                len(detections),

            "detections":
                detections

        }


    except Exception as e:

        return JSONResponse(

            status_code=500,

            content={
                "success": False,
                "message": str(e)
            }

        )


# ============================================================
# LINE 73-75: Start message
# ============================================================

@app.post("/detect-video")
async def detect_litter_video(
    file: UploadFile = File(...)
):

    video_path = None
    video = None

    try:

        # ----------------------------------------------------
        # Save uploaded video temporarily
        # ----------------------------------------------------

        extension = Path(file.filename).suffix or ".mp4"

        video_filename = f"{uuid.uuid4()}{extension}"

        video_path = VIDEO_DIR / video_filename

        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(
                file.file,
                buffer
            )


        # ----------------------------------------------------
        # Open video
        # ----------------------------------------------------

        video = cv2.VideoCapture(
            str(video_path)
        )

        if not video.isOpened():

            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "message": "Unable to open video file"
                }
            )


        # ----------------------------------------------------
        # Get video information
        # ----------------------------------------------------

        fps = video.get(
            cv2.CAP_PROP_FPS
        ) or 25

        total_frames = int(
            video.get(
                cv2.CAP_PROP_FRAME_COUNT
            )
        )

        duration = (
            total_frames / fps
            if total_frames > 0
            else 0
        )


        # ----------------------------------------------------
        # Sample only a limited number of frames
        #
        # This is much faster than running YOLO every second
        # for the entire video.
        # ----------------------------------------------------

        max_samples = 12

        if total_frames > 0:

            sample_count = min(
                max_samples,
                total_frames
            )

            frame_indices = []

            for i in range(sample_count):

                if sample_count == 1:
                    index = 0
                else:
                    index = int(
                        i * (total_frames - 1)
                        / (sample_count - 1)
                    )

                frame_indices.append(index)

        else:

            frame_indices = list(
                range(
                    0,
                    max_samples * int(fps * 2),
                    int(fps * 2)
                )
            )


        # ----------------------------------------------------
        # Detection variables
        # ----------------------------------------------------

        best_confidence = 0

        best_detections = []

        detected_at_seconds = None

        evidence_image_base64 = None


        # ----------------------------------------------------
        # Analyze sampled frames
        # ----------------------------------------------------

        for frame_index in frame_indices:

            video.set(
                cv2.CAP_PROP_POS_FRAMES,
                frame_index
            )

            success, frame = video.read()

            if not success:
                continue


            # ------------------------------------------------
            # Run YOLO
            # Lower image size + confidence for faster
            # deployment on CPU.
            # ------------------------------------------------

            results = model(
                frame,
                conf=0.25,
                imgsz=416,
                verbose=False
            )

            result = results[0]

            detections = []


            # ------------------------------------------------
            # Extract detections
            # ------------------------------------------------

            if result.boxes is not None:

                for box in result.boxes:

                    confidence = float(
                        box.conf[0]
                    )

                    class_id = int(
                        box.cls[0]
                    )

                    detections.append({

                        "class":
                            result.names[class_id],

                        "confidence":
                            round(
                                confidence,
                                3
                            )

                    })


            # ------------------------------------------------
            # Keep the strongest detection
            # ------------------------------------------------

            if detections:

                highest = max(
                    item["confidence"]
                    for item in detections
                )

                if highest > best_confidence:

                    best_confidence = highest

                    best_detections = detections

                    detected_at_seconds = round(
                        frame_index / fps,
                        1
                    )


                    # ----------------------------------------
                    # Create evidence image
                    # ----------------------------------------

                    image_ok, image_buffer = (
                        cv2.imencode(
                            ".jpg",
                            frame
                        )
                    )

                    if image_ok:

                        evidence_image_base64 = (
                            base64.b64encode(
                                image_buffer
                            ).decode("utf-8")
                        )


        # ----------------------------------------------------
        # Release video
        # ----------------------------------------------------

        if video is not None:
            video.release()

            video = None


        # ----------------------------------------------------
        # Determine result
        # ----------------------------------------------------

        litter_detected = (
            len(best_detections) > 0
        )


        # IMPORTANT:
        # Any litter detected anywhere in the video
        # is treated as an event.
        event_detected = litter_detected


        print(
            f"Video analyzed: "
            f"{duration:.1f}s, "
            f"{len(frame_indices)} frames sampled, "
            f"litter={litter_detected}, "
            f"confidence={best_confidence:.3f}"
        )


        return {

            "success": True,

            "eventDetected":
                event_detected,

            "litterDetected":
                litter_detected,

            "count":
                len(best_detections),

            "detections":
                best_detections,

            "highestConfidence":
                best_confidence,

            "detectedAtSeconds":
                detected_at_seconds,

            "evidenceImageBase64":
                evidence_image_base64
        }


    except Exception as e:

        print(
            "Video detection error:",
            str(e)
        )

        return JSONResponse(

            status_code=500,

            content={

                "success": False,

                "message":
                    str(e)
            }
        )


    finally:

        # ----------------------------------------------------
        # Always release OpenCV
        # ----------------------------------------------------

        if video is not None:

            try:
                video.release()
            except Exception:
                pass


        # ----------------------------------------------------
        # Delete temporary video
        # ----------------------------------------------------

        if video_path is not None:

            try:

                if video_path.exists():
                    video_path.unlink()

            except Exception:
                pass