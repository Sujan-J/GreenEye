import express from 'express';
import Violation from '../models/Violation.js';
import multer from 'multer';
import {
  detectLitter,
  detectLitterVideo
} from '../services/aiService.js';import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '../../uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

const videosDir = path.join(
  __dirname,
  '../../video-uploads'
);

fs.mkdirSync(videosDir, {
  recursive: true
});

const videoStorage = multer.diskStorage({
  destination: videosDir,

  filename: (req, file, cb) => {
    const extension =
      path.extname(file.originalname) || '.mp4';

    cb(
      null,
      `video-${Date.now()}${extension}`
    );
  }
});

const videoUpload = multer({
  storage: videoStorage,

  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

const checksDir = path.join(
  __dirname,
  '../../temporary-checks'
);

fs.mkdirSync(checksDir, {
  recursive: true
});

const checkStorage = multer.diskStorage({
  destination: checksDir,

  filename: (req, file, cb) => {
    cb(
      null,
      `check-${Date.now()}.jpg`
    );
  }
});

const checkUpload = multer({
  storage: checkStorage
});

const storage = multer.diskStorage({
  destination: uploadsDir,

  filename: (req, file, cb) => {
    const extension =
      path.extname(file.originalname) || '.jpg';

    cb(
      null,
      `evidence-${Date.now()}${extension}`
    );
  }
});

const upload = multer({
  storage: storage
});
router.get('/', async (req,res) => {
  try { res.json(await Violation.find().sort({createdAt:-1})); }
  catch(e){ res.status(500).json({message:e.message}); }
});
router.post('/', async (req,res) => {
  try {
    const violation = await Violation.create({ violationId: `GV-${Date.now()}`, ...req.body });
    res.status(201).json(violation);
  } catch(e){ res.status(400).json({message:e.message}); }
});
router.post('/analyze', upload.single('file'), async (req, res) => {

  try {

    // LINE 1: Check image
    if (!req.file) {
      return res.status(400).json({
        message: 'Image file is required'
      });
    }


    // LINE 2: Send image to Python AI
    const result = await detectLitter(req.file.path);

    const studentId = req.body.studentId || null;

    // Prevent duplicate violations within 30 seconds
    if (studentId) {

        const thirtySecondsAgo =
          new Date(Date.now() - 30 * 1000);

        const recentViolation =
          await Violation.findOne({
            studentId: studentId,
            createdAt: { $gte: thirtySecondsAgo }
          }).sort({ createdAt: -1 });

        if (recentViolation) {

          return res.json({
            success: true,
            litterDetected: true,
            duplicate: true,
            message:
              'Recent violation already recorded for this student.',
            violation: recentViolation
          });

        }
      }


    // LINE 3: If no litter is detected, don't create violation
    if (!result.litterDetected) {

      return res.json({
        success: true,
        litterDetected: false,
        message: 'No litter detected',
        aiResult: result
      });

    }
    

    // Prevent duplicate violations within 30 seconds
    if (studentId) {

      const thirtySecondsAgo =
        new Date(Date.now() - 30 * 1000);

      const recentViolation =
        await Violation.findOne({
          studentId: studentId,
          createdAt: { $gte: thirtySecondsAgo }
        }).sort({ createdAt: -1 });

      if (recentViolation) {

        return res.json({
          success: true,
          litterDetected: true,
          duplicate: true,
          message:
            'Recent violation already recorded for this student.',
          violation: recentViolation
        });

      }
    }

    // LINE 4: Find highest-confidence detection
    const highestConfidence =
      Math.max(
        ...result.detections.map(
          detection => detection.confidence
        )
      );


    // LINE 5: Create MongoDB violation
    const violation = await Violation.create({

      violationId: `GV-${Date.now()}`,

      studentId: studentId,

      type:
        req.body.eventType ===
        'suspected_littering'
          ? 'Suspected Littering Event'
          : 'Littering',

      location: 'College Campus',

      confidence: highestConfidence,

      evidenceImage:
        `/uploads/${req.file.filename}`,

      status: 'Pending Review',

      fineAmount: 100

    });


    // LINE 6: Return AI + violation information
    res.status(201).json({

      success: true,

      litterDetected: true,

      aiResult: result,

      violation: violation

    });


  } catch (e) {

    console.error(
      'AI analysis error:',
      e
    );

    res.status(500).json({
      message: e.message
    });

  }

});
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      'Pending Review',
      'Reviewed'
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid violation status'
      });
    }

    const violation =
      await Violation.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );

    if (!violation) {
      return res.status(404).json({
        message: 'Violation not found'
      });
    }

    res.json(violation);

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

router.get('/export/csv', async (req, res) => {
  try {
    const violations = await Violation
      .find()
      .sort({ createdAt: -1 });

    const escapeCsv = (value) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = violations.map((v) => [
      v.violationId,
      v.studentId,
      v.type,
      v.location,
      v.confidence,
      v.fineAmount,
      v.status,
      v.evidenceImage,
      v.createdAt
    ].map(escapeCsv).join(','));

    const csv = [
      'Violation ID,Student ID,Type,Location,Confidence,Fine,Status,Evidence Image,Created At',
      ...rows
    ].join('\n');

    res.setHeader(
      'Content-Type',
      'text/csv; charset=utf-8'
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="greeneye-violations-report.csv"'
    );

    res.send(csv);

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

router.post(
  '/analyze-video',
  videoUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: 'Video file is required'
        });
      }

      const result = await detectLitterVideo(
        req.file.path
      );

      if (!result.eventDetected) {
        return res.json({
          success: true,
          eventDetected: false,
          litterDetected: result.litterDetected,
          message:
            'No new littering event detected in this video.',
          aiResult: result
        });
      }

      const studentId =
        req.body.studentId || null;

      const evidenceFilename =
        `video-evidence-${Date.now()}.jpg`;

      const evidencePath = path.join(
        uploadsDir,
        evidenceFilename
      );

      fs.writeFileSync(
        evidencePath,
        Buffer.from(
          result.evidenceImageBase64,
          'base64'
        )
      );

      const violation = await Violation.create({
        violationId: `GV-${Date.now()}`,
        studentId: studentId,
        type: 'Suspected Littering Event',
        location: 'Uploaded Video',
        confidence:
          result.highestConfidence || 0,
        evidenceImage:
          `/uploads/${evidenceFilename}`,
        status: 'Pending Review',
        fineAmount: 100
      });

      res.status(201).json({
        success: true,
        eventDetected: true,
        litterDetected: true,
        detectedAtSeconds:
          result.detectedAtSeconds,
        aiResult: result,
        violation: violation
      });

    } catch (error) {
      console.error(
        'Video analysis error:',
        error
      );

      res.status(500).json({
        message: error.message
      });
    }
  }
);

router.patch(
  '/:id/payment',
  async (req, res) => {
    try {
      const { paymentStatus } = req.body;

      if (
        !['Unpaid', 'Paid'].includes(
          paymentStatus
        )
      ) {
        return res.status(400).json({
          message: 'Invalid payment status'
        });
      }

      const violation =
        await Violation.findByIdAndUpdate(
          req.params.id,
          {
            paymentStatus,
            paidAt:
              paymentStatus === 'Paid'
                ? new Date()
                : null
          },
          { new: true }
        );

      if (!violation) {
        return res.status(404).json({
          message: 'Violation not found'
        });
      }

      res.json(violation);

    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

router.get(
  '/analytics/summary',
  async (req, res) => {
    try {
      const [summary] = await Violation.aggregate([
        {
          $group: {
            _id: null,

            totalViolations: {
              $sum: 1
            },

            pendingReview: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      '$status',
                      'Pending Review'
                    ]
                  },
                  1,
                  0
                ]
              }
            },

            reviewed: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      '$status',
                      'Reviewed'
                    ]
                  },
                  1,
                  0
                ]
              }
            },

            totalFines: {
              $sum: '$fineAmount'
            },

            paidFines: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      '$paymentStatus',
                      'Paid'
                    ]
                  },
                  '$fineAmount',
                  0
                ]
              }
            },

            unpaidFines: {
              $sum: {
                $cond: [
                  {
                    $ne: [
                      '$paymentStatus',
                      'Paid'
                    ]
                  },
                  '$fineAmount',
                  0
                ]
              }
            }
          }
        }
      ]);

      res.json(
        summary || {
          totalViolations: 0,
          pendingReview: 0,
          reviewed: 0,
          totalFines: 0,
          paidFines: 0,
          unpaidFines: 0
        }
      );

    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

router.post(
  '/check-litter',
  checkUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: 'Image file is required'
        });
      }

      const result = await detectLitter(
        req.file.path
      );

      res.json({
        success: true,
        litterDetected:
          result.litterDetected,
        confidence:
          result.detections?.[0]
            ?.confidence || 0
      });

    } catch (error) {
      res.status(500).json({
        message: error.message
      });

    } finally {
      if (req.file?.path) {
        fs.unlink(
          req.file.path,
          () => {}
        );
      }
    }
  }
);

export default router;
