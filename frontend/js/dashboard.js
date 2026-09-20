/* ================= FACE API ================= */

let faceModelsLoaded = false;
let identifiedStudentId = null;
let surveillanceTimer = null;
let surveillanceRunning = false;
let litterDetectionRunning = false;
let liveCameraBaselineReady = false;
let violationStatusFilter =
  localStorage.getItem('violationStatusFilter') || 'All';
  
async function loadFaceModels() {

    try {

        console.log('Loading face recognition models...');

        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');

        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');

        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');

        faceModelsLoaded = true;

        console.log('Face recognition models loaded successfully.');

    } catch (error) {

        console.error(
            'Failed to load face recognition models:',
            error
        );

    }
}

/* ================= FACE CAMERA ================= */

let faceStream = null;

async function startFaceCamera() {
    
    const video = document.getElementById('faceVideo');
    const placeholder = document.getElementById('cameraPlaceholder');
    const captureButton = document.getElementById('captureFaceBtn');
    const identifyButton = document.getElementById('identifyFaceBtn');
    const message = document.getElementById('faceMessage');

    try {

        faceStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: 'user'
            },
            audio: false
        });

        video.srcObject = faceStream;

        video.style.display = 'block';
        placeholder.style.display = 'none';

        captureButton.disabled = false;
        identifyButton.disabled = false;

        message.textContent =
            'Camera started. Position your face clearly in the frame.';

        message.className = 'form-message success';

    } catch (error) {

        console.error('Camera error:', error);

        message.textContent =
            'Unable to access camera. Please allow camera permission.';

        message.className = 'form-message error';
    }
}

/* ================= FACE ENROLLMENT ================= */

async function enrollFace() {

    const video = document.getElementById('faceVideo');
    const studentSelect = document.getElementById('faceStudentSelect');
    const captureButton = document.getElementById('captureFaceBtn');
    const message = document.getElementById('faceMessage');
    const status = document.getElementById('faceStatus');

    const studentId = studentSelect.value;

    if (!studentId) {
        message.textContent = 'Please select a student first.';
        message.className = 'form-message error';
        return;
    }

    if (!faceModelsLoaded) {
        message.textContent = 'Face recognition models are still loading.';
        message.className = 'form-message error';
        return;
    }

    if (!faceStream) {
        message.textContent = 'Please start the camera first.';
        message.className = 'form-message error';
        return;
    }

    try {

        captureButton.disabled = true;

        message.textContent = 'Detecting face...';
        message.className = 'form-message';

        const detection = await faceapi
            .detectSingleFace(
                video,
                new faceapi.TinyFaceDetectorOptions({
                    inputSize: 416,
                    scoreThreshold: 0.5
                })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {

            message.textContent =
                'No clear face detected. Look directly at the camera and try again.';

            message.className = 'form-message error';

            captureButton.disabled = false;

            return;
        }

        const descriptor =
            Array.from(detection.descriptor);

        console.log(
            'Face descriptor generated:',
            descriptor.length,
            'values'
        );

        message.textContent =
            'Face detected. Saving face data...';

        const response = await fetch(
            `/api/students/${encodeURIComponent(studentId)}`,
            {
                method: 'PUT',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    faceDescriptor: descriptor
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || 'Unable to save face data'
            );
        }

        status.textContent = 'Face Enrolled ✓';
        status.className = 'face-status enrolled';

        message.textContent =
            '✓ Face enrolled successfully for ' + studentId;

        message.className =
            'form-message success';

        console.log(
            'Face enrollment successful:',
            result
        );

    } catch (error) {

        console.error(
            'Face enrollment error:',
            error
        );

        message.textContent =
            'Face enrollment failed: ' + error.message;

        message.className =
            'form-message error';

    } finally {

        captureButton.disabled = false;
    }
}

function setViolationStatusFilter(status) {
  localStorage.setItem(
    'violationStatusFilter',
    status
  );

  window.location.reload();
}

/* ================= FACE IDENTIFICATION ================= */

async function identifyFace() {

    const video =
        document.getElementById('faceVideo');

    const message =
        document.getElementById('faceMessage');

    const identifyButton =
        document.getElementById('identifyFaceBtn');

    if (!faceModelsLoaded) {

        message.textContent =
            'Face recognition models are not loaded yet.';

        message.className =
            'form-message error';

        return;
    }

    if (!faceStream) {

        message.textContent =
            'Please start the camera first.';

        message.className =
            'form-message error';

        return;
    }

    try {

        identifyButton.disabled = true;

        message.textContent =
            'Looking for a registered student...';

        message.className =
            'form-message';


        /* Detect current face */

        const detection = await faceapi
            .detectSingleFace(
                video,
                new faceapi.TinyFaceDetectorOptions({
                    inputSize: 416,
                    scoreThreshold: 0.5
                })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();


        if (!detection) {

            message.textContent =
                'No clear face detected. Please face the camera.';

            message.className =
                'form-message error';

            return;
        }


        /* Get registered students */

        const students =
            await getJSON('/api/students');


        /* Keep only students with enrolled faces */

        const enrolledStudents =
            students.filter(
                student =>
                    Array.isArray(student.faceDescriptor) &&
                    student.faceDescriptor.length === 128
            );


        if (enrolledStudents.length === 0) {

            message.textContent =
                'No students have enrolled face data yet.';

            message.className =
                'form-message error';

            return;
        }


        /* Find closest face */

        let bestMatch = null;

        let bestDistance = Infinity;


        for (const student of enrolledStudents) {

            const storedDescriptor =
                new Float32Array(
                    student.faceDescriptor
                );


            const distance =
                faceapi.euclideanDistance(
                    detection.descriptor,
                    storedDescriptor
                );


            if (distance < bestDistance) {

                bestDistance = distance;

                bestMatch = student;
            }
        }


        /*
         * Lower distance means a closer face match.
         * 0.55 is a reasonable starting threshold
         * for this college-project prototype.
         */

        const MATCH_THRESHOLD = 0.55;


        if (
            bestMatch &&
            bestDistance <= MATCH_THRESHOLD
        ) {

            identifiedStudentId = bestMatch.studentId;

            message.innerHTML = `
                <strong>✓ Student Identified</strong><br>
                ${escapeHTML(bestMatch.studentId)}
                -
                ${escapeHTML(bestMatch.name)}
                <br>
                Match distance:
                ${bestDistance.toFixed(3)}
            `;

            message.className =
                'form-message success';


            console.log(
                'Student identified:',
                bestMatch.studentId,
                bestMatch.name,
                'distance:',
                bestDistance
            );

        } else {

            identifiedStudentId = null;

            message.innerHTML = `
                <strong>⚠ Unknown Person</strong><br>
                No registered student matched this face.
                <br>
                Closest distance:
                ${bestDistance.toFixed(3)}
            `;

            message.className =
                'form-message error';


            console.log(
                'No matching student found.',
                'Best distance:',
                bestDistance
            );
        }


    } catch (error) {

        console.error(
            'Face identification error:',
            error
        );

        message.textContent =
            'Face identification failed: ' +
            error.message;

        message.className =
            'form-message error';

    } finally {

        identifyButton.disabled = false;
    }
}

async function analyzeUploadedVideo() {
  const fileInput =
    document.getElementById(
      'videoFileInput'
    );

  const message =
    document.getElementById(
      'videoAnalysisMessage'
    );

  const studentId =
    document.getElementById(
      'videoStudentId'
    ).value.trim();

  const file = fileInput.files[0];

  if (!file) {
    message.textContent =
      'Please choose a video first.';

    message.className =
      'form-message error';

    return;
  }

  const formData = new FormData();

  formData.append('file', file);

  if (studentId) {
    formData.append(
      'studentId',
      studentId
    );
  }

  message.textContent =
    'Analyzing video. Please wait...';

  message.className =
    'form-message';

  try {
    const response = await fetch(
      '/api/violations/analyze-video',
      {
        method: 'POST',
        body: formData
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message ||
        'Video analysis failed'
      );
    }

    if (result.eventDetected) {
    message.textContent =
        `🚨 Suspected littering event at ` +
        `${result.detectedAtSeconds}s. ` +
        'Evidence image and review record created.';

    message.className =
        'form-message success';

    } else if (result.litterDetected) {
    message.textContent =
        'ℹ Litter was visible at the start of the video. ' +
        'No new littering event was created.';

    message.className =
        'form-message';

    } else {
    message.textContent =
        '✅ No litter or littering event detected.';

    message.className =
        'form-message success';
    }
  } catch (error) {
    message.textContent =
      'Video detection failed: ' +
      error.message;

    message.className =
      'form-message error';
  }
}

/* ================= EXISTING DASHBOARD CODE ================= */

async function getJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
}


/* ================= LOAD DASHBOARD ================= */

async function loadData() {

    try {

        const [students, violations] = await Promise.all([
            getJSON('/api/students'),
            getJSON('/api/violations')
        ]);


        /* Dashboard counts */

        document.getElementById('studentCount').textContent =
            students.length;

        document.getElementById('violationCount').textContent =
            violations.length;

        document.getElementById('pendingCount').textContent =
            violations.filter(
                v => v.status === 'Pending Review'
            ).length;

        document.getElementById('fineCount').textContent =
            violations.filter(
                v => Number(v.fineAmount) > 0
            ).length;

        const paidFines = violations
            .filter(
                v => v.paymentStatus === 'Paid'
            )
            .reduce(
                (total, v) =>
                total + Number(v.fineAmount || 0),
                0
            );

            const unpaidFines = violations
            .filter(
                v => v.paymentStatus !== 'Paid'
            )
            .reduce(
                (total, v) =>
                total + Number(v.fineAmount || 0),
                0
            );

            const totalFineAmount =
                paidFines + unpaidFines;

            document
            .getElementById('fineTotalAmount')
            .textContent = `₹${totalFineAmount}`;

            document
            .getElementById('finePaidAmount')
            .textContent = `₹${paidFines}`;

            document
            .getElementById('fineUnpaidAmount')
            .textContent = `₹${unpaidFines}`;

            document
            .getElementById('reportTotalViolations')
            .textContent = violations.length;

            document
            .getElementById('reportPendingReview')
            .textContent = violations.filter(
                v => v.status === 'Pending Review'
            ).length;

            document
            .getElementById('reportPaidFines')
            .textContent = `₹${paidFines}`;

            document
            .getElementById('reportUnpaidFines')
            .textContent = `₹${unpaidFines}`;

            const pendingReviewCount =
            violations.filter(
                v => v.status === 'Pending Review'
            ).length;

            const reviewedCount =
            violations.filter(
                v => v.status === 'Reviewed'
            ).length;

            const pendingPercentage =
            violations.length
                ? Math.round(
                    (pendingReviewCount /
                    violations.length) * 100
                )
                : 0;

            document
            .getElementById('pendingReviewBar')
            .style.width = `${pendingPercentage}%`;

            document
            .getElementById('pendingReviewBar')
            .textContent =
                `${pendingPercentage}% Pending`;

            document
            .getElementById('reviewStatusText')
            .textContent =
                `${pendingReviewCount} pending review • ` +
                `${reviewedCount} reviewed`;

        /* Violations table */

        const violationTable =
            document.getElementById('violationTable');


        if (violations.length === 0) {

            violationTable.innerHTML = `
                <tr>
                    <td colspan="6" class="empty">
                        No violations recorded yet.
                    </td>
                </tr>
            `;

        } else {

            violationTable.innerHTML =
                violations
                    .slice(0, 10)
                    .filter(v =>
                        violationStatusFilter === 'All' ||
                        v.status === violationStatusFilter
                    )
                    .map(v => {

                        const statusClass =
                            v.status === 'Pending Review'
                                ? 'pending-status'
                                : 'normal-status';


                        return `
                            <tr>

                                <td>
                                    ${escapeHTML(v.violationId || '-')}
                                </td>

                                <td>
                                    ${escapeHTML(
                                        v.studentId || 'Unidentified'
                                    )}
                                </td>

                                <td>
                                    ${escapeHTML(v.type || 'Littering')}
                                </td>

                                <td>
                                    ${escapeHTML(v.location || '-')}
                                </td>

                                <td>
                                    ₹${Number(v.fineAmount || 0)}
                                </td>

                                <td>
                                    <span>
                                        ${v.paymentStatus || 'Unpaid'}
                                    </span>

                                    ${
                                        (v.paymentStatus || 'Unpaid') === 'Unpaid'
                                        ? `
                                            <button
                                            onclick="markFinePaid('${v._id}')"
                                            style="
                                                margin-left: 8px;
                                                padding: 5px 8px;
                                                border: none;
                                                border-radius: 5px;
                                                cursor: pointer;
                                                background: #146c43;
                                                color: white;
                                            "
                                            >
                                            ✓ Mark Paid
                                            </button>
                                        `
                                        : ''
                                    }
                                </td>

                                <td class="evidence-cell">
                                ${
                                    v.evidenceImage
                                    ? (() => {
                                        const imagePath = String(v.evidenceImage).trim();

                                        const imageUrl =
                                            imagePath.startsWith('http://') ||
                                            imagePath.startsWith('https://')
                                                ? imagePath
                                                : imagePath.startsWith('/')
                                                    ? imagePath
                                                    : `/${imagePath}`;

                                        return `
                                            <a
                                                href="${imageUrl}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="evidence-link"
                                            >
                                                <img
                                                    src="${imageUrl}"
                                                    alt="Evidence for ${escapeHTML(v.violationId)}"
                                                    class="evidence-thumbnail"
                                                    loading="lazy"
                                                    onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"
                                                >

                                                <span
                                                    class="evidence-error"
                                                    style="display:none;"
                                                >
                                                    Image unavailable
                                                </span>
                                            </a>
                                        `;
                                    })()
                                    : '—'
                                }
                                </td>

                                <td>
                                    <span>${v.status}</span>

                                    ${
                                        v.status === 'Pending Review'
                                        ? `
                                            <button
                                            onclick="markViolationReviewed('${v._id}')"
                                            style="
                                                margin-left: 8px;
                                                padding: 5px 8px;
                                                border: none;
                                                border-radius: 5px;
                                                cursor: pointer;
                                                background: #198754;
                                                color: white;
                                            "
                                            >
                                            ✓ Mark Reviewed
                                            </button>
                                        `
                                        : ''
                                    }
                                    </td>

                            </tr>
                        `;

                    })
                    .join('');
        }


        /* Student table */

        loadStudentsTable(students);


    } catch (error) {

        console.error(
            'Dashboard loading error:',
            error
        );


        document.getElementById('violationTable').innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    Unable to load violation data.
                </td>
            </tr>
        `;

        document.getElementById('studentTable').innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    Unable to load student data.
                </td>
            </tr>
        `;
    }
}

async function markFinePaid(id) {
  try {
    const response = await fetch(
      `/api/violations/${id}/payment`,
      {
        method: 'PATCH',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          paymentStatus: 'Paid'
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message ||
        'Could not update payment'
      );
    }

    window.location.reload();

  } catch (error) {
    alert(
      'Could not mark fine as paid: ' +
      error.message
    );
  }
}

async function markViolationReviewed(id) {
  try {
    const response = await fetch(
      `/api/violations/${id}/status`,
      {
        method: 'PATCH',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          status: 'Reviewed'
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || 'Unable to update violation'
      );
    }

    window.location.reload();

  } catch (error) {
    alert(
      'Could not update violation: ' + error.message
    );
  }
}

/* ================= STUDENT TABLE ================= */

function loadStudentsTable(students) {

    const studentTable =
        document.getElementById('studentTable');

    const faceStudentSelect =
        document.getElementById('faceStudentSelect');

    if (faceStudentSelect) {

        faceStudentSelect.innerHTML = `
            <option value="">
                Select a registered student
            </option>
        `;

        students.forEach(student => {

            const option =
                document.createElement('option');

            option.value = student.studentId;

            option.textContent =
                `${student.studentId} - ${student.name}`;

            faceStudentSelect.appendChild(option);
        });
    }

    if (!students.length) {

        studentTable.innerHTML = `
            <tr>
                <td colspan="7" class="empty">
                    No students registered yet.
                </td>
            </tr>
        `;

        return;
    }


    studentTable.innerHTML =
        students
            .map(student => {

                return `
                    <tr>

                        <td>
                            <strong>
                                ${escapeHTML(student.studentId)}
                            </strong>
                        </td>

                        <td>
                            ${escapeHTML(student.name)}
                        </td>

                        <td>
                            ${escapeHTML(
                                student.department || 'CSE'
                            )}
                        </td>

                        <td>
                            ${student.semester || '-'}
                        </td>

                        <td>
                            ${escapeHTML(student.email)}
                        </td>

                        <td>
                            ${escapeHTML(student.phone || '-')}
                        </td>

                        <td>

                            <button
                                class="table-btn edit-btn"
                                onclick="editStudent('${escapeHTML(student.studentId)}')"
                            >
                                ✏️
                            </button>

                            <button
                                class="table-btn delete-btn"
                                onclick="deleteStudent('${escapeHTML(student.studentId)}')"
                            >
                                🗑️
                            </button>

                        </td>

                    </tr>
                `;

            })
            .join('');
}


/* ================= REGISTER STUDENT ================= */

document
    .getElementById('studentForm')
    .addEventListener('submit', async function (event) {

        event.preventDefault();


        const form = event.target;

        const formMessage =
            document.getElementById('formMsg');


        const data =
            Object.fromEntries(
                new FormData(form)
            );


        data.semester =
            Number(data.semester);


        try {

            formMessage.textContent =
                'Registering student...';

            formMessage.className =
                'form-message';


            const response = await fetch(
                '/api/students',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify(data)
                }
            );


            const result =
                await response.json();


            if (!response.ok) {
                throw new Error(
                    result.message ||
                    'Unable to register student'
                );
            }


            formMessage.textContent =
                '✓ Student registered successfully.';

            formMessage.className =
                'form-message success';


            form.reset();


            /* Restore default semester */

            form.querySelector(
                '[name="semester"]'
            ).value = '7';


            /* Reload dashboard */

            await loadData();


        } catch (error) {

            console.error(error);


            formMessage.textContent =
                error.message;


            formMessage.className =
                'form-message error';
        }

    });


/* ================= HTML SAFETY ================= */

function escapeHTML(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ================= YOLO LITTER DETECTION ================= */

async function detectLitterFromCamera(
  isSuspectedEvent = false
) {

    if (litterDetectionRunning) {
        console.log('Litter detection already running. Skipping this cycle.');
        return;
    }

    litterDetectionRunning = true;

    const video =
        document.getElementById('faceVideo');

    const message =
        document.getElementById('faceMessage');

    try {

        // Check camera
        if (!faceStream) {
            message.textContent =
                'Please start the camera first.';
            message.className =
                'form-message error';
            return;
        }


        // Check identified student
        if (!identifiedStudentId) {
            message.textContent =
                'Please identify the student first.';
            message.className =
                'form-message error';
            return;
        }


        message.textContent =
            'Capturing image and checking for litter...';

        message.className =
            'form-message';


        // Create temporary canvas
        const canvas =
            document.createElement('canvas');

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;


        const ctx =
            canvas.getContext('2d');


        // Capture current camera frame
        ctx.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );


        // Convert frame to image blob
        const blob =
            await new Promise(resolve =>
                canvas.toBlob(
                    resolve,
                    'image/jpeg',
                    0.90
                )
            );


        if (!blob) {
            throw new Error(
                'Unable to capture camera image.'
            );
        }


        // Send image to GreenEye backend
        const formData =
            new FormData();

        formData.append(
            'file',
            blob,
            'camera-frame.jpg'
        );

        formData.append(
            'studentId',
            identifiedStudentId
        );

        if (isSuspectedEvent) {
            formData.append(
                'eventType',
                'suspected_littering'
            );
        }

        message.textContent =
            'AI is checking the image...';


        const response =
            await fetch(
                '/api/violations/analyze',
                {
                    method: 'POST',
                    body: formData
                }
            );


        const result =
            await response.json();


        if (!response.ok) {
            throw new Error(
                result.message ||
                'AI analysis failed'
            );
        }


        if (result.litterDetected) {

            if (result.duplicate) {

                message.innerHTML =
                    `<strong>⚠️ Recent Violation</strong><br>
                    Student: ${escapeHTML(identifiedStudentId)}
                    <br>
                    This incident was already recorded.`;

            } else {

                message.innerHTML =
                    `<strong>🚨 Litter Detected</strong><br>
                    Student: ${escapeHTML(identifiedStudentId)}
                    <br>
                    Violation created successfully.`;

            }

            message.className =
                'form-message success';

            console.log(
                'GreenEye violation result:',
                result
            );

            await loadData();

        }


    } catch (error) {

        console.error(
            'Camera litter detection error:',
            error
        );

        message.textContent =
            'Litter detection failed: ' +
            error.message;

        message.className =
            'form-message error';
    } finally {
        litterDetectionRunning = false;
    }
    
}

/* ================= START ================= */

/* ================= AUTO SURVEILLANCE ================= */

function startSurveillance() {

    if (surveillanceRunning) {
        return;
    }

    if (!faceStream) {

        const message =
            document.getElementById('faceMessage');

        message.textContent =
            'Please start the camera first.';

        message.className =
            'form-message error';

        return;
    }

    if (!identifiedStudentId) {

        const message =
            document.getElementById('faceMessage');

        message.textContent =
            'Please identify the student first.';

        message.className =
            'form-message error';

        return;
    }

    liveCameraBaselineReady = false;
    surveillanceRunning = true;

    const startButton =
        document.getElementById(
            'startSurveillanceBtn'
        );

    const stopButton =
        document.getElementById(
            'stopSurveillanceBtn'
        );

    startButton.disabled = true;
    stopButton.disabled = false;

    const message =
        document.getElementById('faceMessage');

    message.textContent =
        `🟢 Surveillance running for ${identifiedStudentId}`;

    message.className =
        'form-message success';

    console.log(
        'GreenEye surveillance started for:',
        identifiedStudentId
    );

    surveillanceCycle();

}
    
async function checkLiveCameraForNewLitter() {
  const video =
    document.getElementById('faceVideo');

  const message =
    document.getElementById('faceMessage');

  const canvas =
    document.createElement('canvas');

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;

  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise(resolve =>
    canvas.toBlob(
      resolve,
      'image/jpeg',
      0.9
    )
  );

  if (!blob) {
    throw new Error(
      'Unable to capture camera image.'
    );
  }

  const formData = new FormData();

  formData.append(
    'file',
    blob,
    'live-check.jpg'
  );

  const response = await fetch(
    '/api/violations/check-litter',
    {
      method: 'POST',
      body: formData
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || 'Live litter check failed'
    );
  }

  if (!result.litterDetected) {
    liveCameraBaselineReady = true;

    message.textContent =
      '✅ Clear camera baseline established.';

    message.className =
      'form-message success';

    return;
  }

  if (!liveCameraBaselineReady) {
    message.textContent =
      'Litter is already visible. Waiting for a clear baseline.';

    message.className =
      'form-message';

    return;
  }

  liveCameraBaselineReady = false;

  message.textContent =
    '🚨 New litter detected. Recording suspected event...';

  message.className =
    'form-message error';

  await detectLitterFromCamera(true);
}

    async function surveillanceCycle() {

        if (!surveillanceRunning) {
            return;
        }

        if (identifiedStudentId) {
            await checkLiveCameraForNewLitter();
        }

        if (surveillanceRunning) {
            surveillanceTimer = setTimeout(
                surveillanceCycle,
                5000
            );
        }
    }


function stopSurveillance() {

    surveillanceRunning = false;

    if (surveillanceTimer) {

        clearInterval(surveillanceTimer);
        surveillanceTimer = null;

    }

    const startButton =
        document.getElementById(
            'startSurveillanceBtn'
        );

    const stopButton =
        document.getElementById(
            'stopSurveillanceBtn'
        );

    startButton.disabled = false;
    stopButton.disabled = true;

    const message =
        document.getElementById('faceMessage');

    message.textContent =
        '⏹ Surveillance stopped.';

    message.className =
        'form-message';

    console.log(
        'GreenEye surveillance stopped.'
    );
}

loadData();
loadFaceModels();

document
  .getElementById('analyzeVideoBtn')
  ?.addEventListener(
    'click',
    analyzeUploadedVideo
  );

document
    .getElementById('startCameraBtn')
    .addEventListener('click', startFaceCamera);

document
    .getElementById('captureFaceBtn')
    .addEventListener('click', enrollFace);

document
    .getElementById('identifyFaceBtn')
    .addEventListener('click', identifyFace);

document
    .getElementById('startSurveillanceBtn')
    .addEventListener(
        'click',
        startSurveillance
    );

document
    .getElementById('stopSurveillanceBtn')
    .addEventListener(
        'click',
        stopSurveillance
    );

async function editStudent(studentId) {

    try {

        const student = await getJSON(
            `/api/students/${encodeURIComponent(studentId)}`
        );

        const newName = prompt(
            'Enter student name:',
            student.name
        );

        if (newName === null) {
            return;
        }

        const newEmail = prompt(
            'Enter student email:',
            student.email
        );

        if (newEmail === null) {
            return;
        }

        const newPhone = prompt(
            'Enter student phone:',
            student.phone || ''
        );

        if (newPhone === null) {
            return;
        }

        const response = await fetch(
            `/api/students/${encodeURIComponent(studentId)}`,
            {
                method: 'PUT',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    name: newName.trim(),
                    email: newEmail.trim(),
                    phone: newPhone.trim()
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || 'Unable to update student'
            );
        }

        alert('Student updated successfully.');

        await loadData();

    } catch (error) {

        console.error(error);

        alert(
            `Update failed: ${error.message}`
        );
    }
}

async function deleteStudent(studentId) {

    const confirmed = confirm(
        `Are you sure you want to delete student ${studentId}?`
    );


    if (!confirmed) {
        return;
    }


    try {

        const response = await fetch(
            `/api/students/${encodeURIComponent(studentId)}`,
            {
                method: 'DELETE'
            }
        );


        const result =
            await response.json();


        if (!response.ok) {
            throw new Error(
                result.message ||
                'Unable to delete student'
            );
        }


        alert('Student deleted successfully.');

        await loadData();


    } catch (error) {

        console.error(error);

        alert(
            `Delete failed: ${error.message}`
        );
    }
}

function updateActiveNavigation() {
  const currentHash =
    window.location.hash || '#dashboard';

  document
    .querySelectorAll('.sidebar nav a')
    .forEach(link => {
      link.classList.toggle(
        'active',
        link.getAttribute('href') ===
          currentHash
      );
    });
}

window.addEventListener(
  'hashchange',
  updateActiveNavigation
);

updateActiveNavigation();

/* ================= THEME SWITCHER ================= */

const themeToggle =
    document.getElementById('themeToggle');

function applyTheme(theme) {

    if (theme === 'dark') {

        document.body.classList.add(
            'dark-theme'
        );

        themeToggle.textContent =
            '☀️ Light Mode';

    } else {

        document.body.classList.remove(
            'dark-theme'
        );

        themeToggle.textContent =
            '🌙 Dark Mode';
    }
}


const savedTheme =
    localStorage.getItem('greenEyeTheme') ||
    'light';

applyTheme(savedTheme);


themeToggle.addEventListener(
    'click',
    () => {

        const isDark =
            document.body.classList.contains(
                'dark-theme'
            );

        const newTheme =
            isDark ? 'light' : 'dark';

        localStorage.setItem(
            'greenEyeTheme',
            newTheme
        );

        applyTheme(newTheme);
    }
);