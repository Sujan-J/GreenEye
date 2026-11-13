import express from 'express';
import Violation from '../models/Violation.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import {
  detectLitter,
  detectLitterVideo
} from '../services/aiService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const router = express.Router();
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
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
router.get('/', async (req, res) => {
  try {
    const violations = await Violation.find({
      isTest: { $ne: true }
    }).sort({ createdAt: -1 });

    res.json(violations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.post('/', async (req,res) => {
  try {
    const violation = await Violation.create({ violationId: `GV-${Date.now()}`, ...req.body });
    res.status(201).json(violation);
  } catch(e){ res.status(400).json({message:e.message}); }
});

router.get('/test-records', async (req, res) => {
  try {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.ENABLE_GREENEYE_TEST_MODE !== 'true'
    ) {
      return res.status(403).json({
        message: 'Test mode is disabled.'
      });
    }

    const records = await Violation.find({
      isTest: true
    }).sort({ createdAt: -1 });

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE ONLY GREENEYE TEST RECORDS
router.delete('/test-records/:id', async (req, res) => {
    try {
        if (
            process.env.NODE_ENV === 'production' ||
            process.env.ENABLE_GREENEYE_TEST_MODE !== 'true'
        ) {
            return res.status(403).json({
                message: 'Test mode is disabled.'
            });
        }

        if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
            return res.status(400).json({
                message: 'Invalid test record ID.'
            });
        }

        const record = await Violation.findOneAndDelete({
            _id: req.params.id,
            isTest: true
        });

        if (!record) {
            return res.status(404).json({
                message: 'Test record not found.'
            });
        }

        res.json({
            success: true,
            message: 'Test record deleted successfully.'
        });

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});

// ==========================================
// GREENEYE SAFE TEST MODE
// No MongoDB violation records or fines
// ==========================================

router.post('/analyze-test', upload.single('file'), async (req, res) => {
  let cloudinaryPublicId = null;

  try {
    // Disable diagnostic endpoint in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Test mode is disabled in production.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a sample image.'
      });
    }

    // Step 1: Run YOLO detection
    const result = await detectLitter(req.file.path);

    // Step 2: If no litter is detected, return without uploading
    if (!result.litterDetected) {
      return res.json({
        success: true,
        testMode: true,
        litterDetected: false,
        databaseWrite: false,
        fineGenerated: false,
        message: 'No litter detected in test image.',
        aiResult: result
      });
    }

    // Step 3: Upload evidence to a separate Cloudinary folder
    const cloudinaryResult = await cloudinary.uploader.upload(
      req.file.path,
      {
        folder: 'greeneye/test-evidence',
        resource_type: 'image'
      }
    );

    cloudinaryPublicId = cloudinaryResult.public_id;

    // Step 4: Return results WITHOUT creating a MongoDB record
    return res.json({
      success: true,
      testMode: true,
      litterDetected: true,
      confidence: Math.max(
        0,
        ...(Array.isArray(result.detections)
          ? result.detections.map(d => Number(d.confidence) || 0)
          : [])
      ),
      evidenceUploaded: true,
      evidenceUrl: cloudinaryResult.secure_url,
      databaseWrite: false,
      fineGenerated: false,
      message: 'Safe test completed successfully.',
      aiResult: result
    });

  } catch (error) {
    console.error('Safe test error:', error);

    // Remove uploaded test asset if a later operation fails
    if (cloudinaryPublicId) {
      await cloudinary.uploader.destroy(cloudinaryPublicId)
        .catch(() => {});
    }

    return res.status(500).json({
      success: false,
      testMode: true,
      message: 'Safe test failed. Check backend logs.'
    });

  } finally {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
  }
});


// ==========================================
// GREENEYE SAFE MONGODB TEST RECORD
// Creates test records only. Never creates fines.
// ==========================================

router.post('/analyze-test-save', upload.single('file'), async (req, res) => {
  let cloudinaryPublicId = null;

  try {
    // Require explicit test-mode permission
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.ENABLE_GREENEYE_TEST_MODE !== 'true'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Safe test mode is disabled.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a sample image.'
      });
    }

    // 1. Run YOLO detection
    const result = await detectLitter(req.file.path);

    if (!result.litterDetected) {
      return res.json({
        success: true,
        testMode: true,
        litterDetected: false,
        databaseWrite: false,
        fineGenerated: false,
        message: 'No litter detected. No test record created.'
      });
    }

    // 2. Calculate highest detection confidence
    const highestConfidence = Math.max(
      0,
      ...(Array.isArray(result.detections)
        ? result.detections.map(
            d => Number(d.confidence) || 0
          )
        : [])
    );

    // 3. Upload evidence to separate test folder
    const cloudResult = await cloudinary.uploader.upload(
      req.file.path,
      {
        folder: 'greeneye/test-evidence',
        resource_type: 'image'
      }
    );

    cloudinaryPublicId = cloudResult.public_id;

    // 4. Create an explicitly marked test record
    const testViolation = await Violation.create({
      violationId: `GV-TEST-${Date.now()}`,
      studentId: null,
      type: 'Test Litter Detection',
      location: 'GreenEye Test Environment',
      confidence: highestConfidence,
      evidenceImage: cloudResult.secure_url,
      isTest: true,
      testLabel: 'YOLO-Cloudinary-MongoDB Integration Test',
      status: 'Pending Review',
      fineAmount: 0,
      paymentStatus: 'Unpaid',
      paidAt: null
    });

    // 5. Return saved test record
    return res.status(201).json({
      success: true,
      testMode: true,
      litterDetected: true,
      evidenceUploaded: true,
      databaseWrite: true,
      fineGenerated: false,
      message: 'Safe test record saved successfully.',
      aiResult: result,
      violation: testViolation
    });

  } catch (error) {
    console.error('Safe MongoDB test error:', error);

    // Clean up Cloudinary image if database save failed
    if (cloudinaryPublicId) {
      await cloudinary.uploader.destroy(cloudinaryPublicId)
        .catch(cleanupError =>
          console.error('Test image cleanup failed:', cleanupError.message)
        );
    }

    return res.status(500).json({
      success: false,
      testMode: true,
      message: 'Safe test record creation failed.'
    });

  } finally {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
  }
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

    // Maximum confidence from the returned YOLO detections.
    const highestConfidence = Math.max(
      0,
      ...(Array.isArray(result.detections) ? result.detections : [])
        .map(detection => Number(detection.confidence) || 0)
    );

    const cloudinaryResult = await cloudinary.uploader.upload(
      req.file.path,
      {
        folder: 'greeneye/evidence',
        resource_type: 'image'
      }
    );
    
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
    
      evidenceImage: cloudinaryResult.secure_url,
    
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
      message: 'Image analysis failed. Check backend logs.'
    });

  } finally {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
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
      .find({ isTest: { $ne: true } })
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

      const cloudinaryResult =
        await cloudinary.uploader.upload(
          `data:image/jpeg;base64,${result.evidenceImageBase64}`,
          {
            folder: 'greeneye/evidence',
            resource_type: 'image'
          }
        );

      const violation = await Violation.create({
        violationId: `GV-${Date.now()}`,
        studentId: studentId,
        type: 'Suspected Littering Event',
        location: 'Uploaded Video',
        confidence:
          result.highestConfidence || 0,
        evidenceImage:
          cloudinaryResult.secure_url,
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
        message: 'Video analysis failed. Check backend logs.'
      });
    } finally {
      if (req.file?.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
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

      const existing = await Violation.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({
          message: 'Violation not found'
        });
      }
      if (existing.isTest) {
        return res.status(403).json({
          message: 'Test records cannot receive payments.'
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
          $match: {
            isTest: { $ne: true }
          }
        },
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
