import express from 'express';
import Student from '../models/Student.js';

const router = express.Router();

// GET all students
router.get('/', async (req, res) => {
    try {
        const students = await Student.find().sort({ createdAt: -1 });
        res.json(students);
    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});


// GET single student
router.get('/:studentId', async (req, res) => {
    try {
        const student = await Student.findOne({
            studentId: req.params.studentId
        });

        if (!student) {
            return res.status(404).json({
                message: 'Student not found'
            });
        }

        res.json(student);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});


// CREATE student
router.post('/', async (req, res) => {
    try {

        const student = await Student.create(req.body);

        res.status(201).json(student);

    } catch (error) {

        // Duplicate USN
        if (error.code === 11000) {
            return res.status(400).json({
                message: 'Student ID / USN already exists.'
            });
        }

        res.status(400).json({
            message: error.message
        });
    }
});


// UPDATE student
router.put('/:studentId', async (req, res) => {

    try {

        const student = await Student.findOneAndUpdate(
            {
                studentId: req.params.studentId
            },
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!student) {
            return res.status(404).json({
                message: 'Student not found'
            });
        }

        res.json(student);

    } catch (error) {

        res.status(400).json({
            message: error.message
        });
    }
});


// DELETE student
router.delete('/:studentId', async (req, res) => {

    try {

        const student = await Student.findOneAndDelete({
            studentId: req.params.studentId
        });

        if (!student) {
            return res.status(404).json({
                message: 'Student not found'
            });
        }

        res.json({
            message: 'Student deleted successfully',
            studentId: req.params.studentId
        });

    } catch (error) {

        res.status(500).json({
            message: error.message
        });
    }
});


export default router;