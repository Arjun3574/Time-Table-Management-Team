const express = require("express");
const oracledb = require("oracledb");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "roles.html"));
});

/*
    Keep your real DB details here.
    Do not share this file publicly after adding your password.
*/
const dbConfig = {
    user:"TEAMA987654_SCHEMA_65VWL",
    password: "X3TuQ5MXAIVJVUS8V22GPORXW4WA!2",
    connectString: "tcps://db.freesql.com:2484/23ai_34ui2"
};

// ===============================
// ORACLE CONNECTION POOL
// ===============================

async function initializePool() {
    try {
        await oracledb.createPool({
            ...dbConfig,
            poolMin: 0,
            poolMax: 1,
            poolIncrement: 1,
            poolTimeout: 30,
            queueTimeout: 60000
        });

        console.log("Oracle connection pool created.");
    } catch (err) {
        console.error("Error creating Oracle connection pool:", err);
        process.exit(1);
    }
}

async function getConnection() {
    return await oracledb.getConnection();
}

process.on("SIGINT", async () => {
    try {
        console.log("Closing Oracle connection pool...");
        await oracledb.getPool().close(10);
        console.log("Oracle pool closed.");
        process.exit(0);
    } catch (err) {
        console.error("Error closing pool:", err);
        process.exit(1);
    }
});

// ===============================
// SHARED PAGE DATA CACHE
// ===============================

let pageDataCache = null;
let pageDataLoadingPromise = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function clearPageDataCache() {
    pageDataCache = null;
}

async function loadPageDataCache() {
    const now = Date.now();

    if (pageDataCache && now - pageDataCache.loadedAt < CACHE_TTL_MS) {
        return pageDataCache;
    }

    if (pageDataLoadingPromise) {
        return await pageDataLoadingPromise;
    }

    pageDataLoadingPromise = (async () => {
        let connection;

        try {
            connection = await getConnection();

            const programsResult = await connection.execute(
                `SELECT ProgramID, ProgramName, DepartmentID, DurationYears
                 FROM Programs
                 ORDER BY ProgramID`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const departmentsResult = await connection.execute(
                `SELECT DepartmentID, DepartmentName
                 FROM Departments
                 ORDER BY DepartmentID`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const divisionsResult = await connection.execute(
                `SELECT DivisionID, DivisionName, SemesterID, Strength
                 FROM Divisions
                 ORDER BY DivisionID`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const semestersResult = await connection.execute(
                `SELECT SemesterID, SemesterName
                 FROM Semesters
                 ORDER BY SemesterID`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const subjectsResult = await connection.execute(
                `SELECT SubjectID, SubjectCode, SubjectName, DepartmentID, SemesterID, Credits, Type, WeeklyHours
                 FROM Subjects
                 ORDER BY SubjectID`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const approvalsResult = await connection.execute(
                `SELECT 
                    ApprovalID,
                    TimetableID,
                    ApprovedBy,
                    ApprovalStatus,
                    Comments,
                    TO_CHAR(ApprovalDate, 'YYYY-MM-DD') AS ApprovalDate
                 FROM TimetableApproval
                 ORDER BY ApprovalID`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const timetablesResult = await connection.execute(
                `SELECT 
                    t.TimetableID,
                    t.DivisionID,
                    d.DivisionName,
                    t.DayID,
                    dy.DayName,
                    t.TimeSlotID,
                    ts.SlotName,
                    t.SubjectID,
                    s.SubjectName,
                    t.TeacherID,
                    u.FullName AS TeacherName
                 FROM Timetable t
                 LEFT JOIN Divisions d
                    ON t.DivisionID = d.DivisionID
                 LEFT JOIN Days dy
                    ON t.DayID = dy.DayID
                 LEFT JOIN TimeSlots ts
                    ON t.TimeSlotID = ts.TimeSlotID
                 LEFT JOIN Subjects s
                    ON t.SubjectID = s.SubjectID
                 LEFT JOIN Users u
                    ON t.TeacherID = u.UserID
                 ORDER BY t.TimetableID`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const usersResult = await connection.execute(
                `SELECT 
                    u.UserID,
                    u.FullName,
                    r.RoleName
                 FROM Users u
                 LEFT JOIN Roles r
                    ON u.RoleID = r.RoleID
                 ORDER BY u.FullName`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            pageDataCache = {
                loadedAt: Date.now(),

                programs: programsResult.rows,
                departments: departmentsResult.rows,
                divisions: divisionsResult.rows,
                semesters: semestersResult.rows,
                subjects: subjectsResult.rows,

                approvals: approvalsResult.rows,
                timetables: timetablesResult.rows,
                users: usersResult.rows
            };

            return pageDataCache;

        } finally {
            pageDataLoadingPromise = null;

            if (connection) {
                try {
                    await connection.close();
                } catch (e) {
                    console.error(e);
                }
            }
        }
    })();

    return await pageDataLoadingPromise;
}

app.use((req, res, next) => {
    if (req.method !== "GET") {
        clearPageDataCache();
    }

    next();
});

// ===============================
// CACHED PAGE DATA APIs
// ===============================

app.get("/api/programs-page-data", async (req, res) => {
    try {
        const data = await loadPageDataCache();

        res.json({
            programs: data.programs,
            departments: data.departments
        });

    } catch (err) {
        console.error("PROGRAMS PAGE DATA ERROR:", err);
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/divisions-page-data", async (req, res) => {
    try {
        const data = await loadPageDataCache();

        res.json({
            divisions: data.divisions,
            semesters: data.semesters
        });

    } catch (err) {
        console.error("DIVISIONS PAGE DATA ERROR:", err);
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/subjects-page-data", async (req, res) => {
    try {
        const data = await loadPageDataCache();

        res.json({
            subjects: data.subjects,
            departments: data.departments,
            semesters: data.semesters
        });

    } catch (err) {
        console.error("SUBJECTS PAGE DATA ERROR:", err);
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/timetable-approval-page-data", async (req, res) => {
    try {
        const data = await loadPageDataCache();

        res.json({
            approvals: data.approvals,
            timetables: data.timetables,
            users: data.users
        });

    } catch (err) {
        console.error("TIMETABLE APPROVAL PAGE DATA ERROR:", err);
        res.status(500).json({ message: err.message });
    }
});

// ===============================
// ROLES ENDPOINTS
// ===============================

app.get("/api/roles/:id", async (req, res) => {
    const { id } = req.params;
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT RoleID, RoleName, Description, Status
             FROM Roles
             WHERE RoleID = :id`,
            [Number(id)],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length > 0) {
            res.json({ exists: true, data: result.rows[0] });
        } else {
            res.json({ exists: false });
        }

    } catch (err) {
        console.error("ROLE CHECK ERROR:", err);
        res.status(500).json({ error: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.post("/api/roles", async (req, res) => {
    const { role_id, role_name, description, status } = req.body;
    let connection;

    try {
        connection = await getConnection();

        const sql = `
            MERGE INTO Roles r
            USING (SELECT :role_id AS RoleID FROM dual) s
            ON (r.RoleID = s.RoleID)
            WHEN MATCHED THEN
                UPDATE SET
                    RoleName = :role_name,
                    Description = :description,
                    Status = :status
            WHEN NOT MATCHED THEN
                INSERT (RoleID, RoleName, Description, Status)
                VALUES (:role_id, :role_name, :description, :status)
        `;

        await connection.execute(
            sql,
            {
                role_id: Number(role_id),
                role_name,
                description: description || null,
                status: status || "Active"
            },
            { autoCommit: true }
        );

        clearPageDataCache();

        res.status(200).send("Role saved successfully!");

    } catch (err) {
        console.error("ROLE SAVE ERROR:", err);
        res.status(500).send("Database Error: " + err.message);

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// DEPARTMENTS ENDPOINTS
// ===============================

app.get("/api/departments", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT DepartmentID, DepartmentName
             FROM Departments
             ORDER BY DepartmentID`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(result.rows);

    } catch (err) {
        console.error("GET DEPARTMENTS ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.get("/api/departments/:id", async (req, res) => {
    const { id } = req.params;
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT DepartmentID, DepartmentCode, DepartmentName, HODUserID, Status
             FROM Departments
             WHERE DepartmentID = :id`,
            [Number(id)],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length > 0) {
            res.json({ exists: true, data: result.rows[0] });
        } else {
            res.json({ exists: false });
        }

    } catch (err) {
        console.error("DEPARTMENT CHECK ERROR:", err);
        res.status(500).json({ error: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.post("/api/departments", async (req, res) => {
    const {
        department_id,
        department_code,
        department_name,
        hod_user_id,
        status
    } = req.body;

    let connection;

    try {
        connection = await getConnection();

        const sql = `
            MERGE INTO Departments d
            USING (SELECT :department_id AS DepartmentID FROM dual) s
            ON (d.DepartmentID = s.DepartmentID)
            WHEN MATCHED THEN
                UPDATE SET
                    DepartmentCode = :department_code,
                    DepartmentName = :department_name,
                    HODUserID = :hod_user_id,
                    Status = :status
            WHEN NOT MATCHED THEN
                INSERT (DepartmentID, DepartmentCode, DepartmentName, HODUserID, Status)
                VALUES (:department_id, :department_code, :department_name, :hod_user_id, :status)
        `;

        await connection.execute(
            sql,
            {
                department_id: Number(department_id),
                department_code: department_code || null,
                department_name: department_name || null,
                hod_user_id: hod_user_id ? Number(hod_user_id) : null,
                status: status || "Active"
            },
            { autoCommit: true }
        );

        clearPageDataCache();

        res.status(200).send("Department saved successfully!");

    } catch (err) {
        console.error("DEPARTMENT SAVE ERROR:", err);
        res.status(500).send("Database Error: " + err.message);

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// PROGRAMS ENDPOINTS
// ===============================

app.get("/api/programs", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT ProgramID, ProgramName, DepartmentID, DurationYears
             FROM Programs
             ORDER BY ProgramID`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(result.rows);

    } catch (err) {
        console.error("GET PROGRAMS ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.post("/api/programs", async (req, res) => {
    let connection;

    try {
        const programId =
            req.body.programId ?? req.body.ProgramID ?? req.body.program_id;

        const programName =
            req.body.programName ?? req.body.ProgramName ?? req.body.program_name;

        const departmentId =
            req.body.departmentId ?? req.body.DepartmentID ?? req.body.department_id;

        const durationYears =
            req.body.durationYears ?? req.body.DurationYears ?? req.body.duration_years;

        const pId = Number(programId);
        const dId = Number(departmentId);
        const years = Number(durationYears);

        if (Number.isNaN(pId) || Number.isNaN(dId) || Number.isNaN(years)) {
            return res.status(400).json({
                message: "Program ID, Department ID, and Duration Years must be valid numbers"
            });
        }

        connection = await getConnection();

        const sql = `
            MERGE INTO Programs p
            USING (SELECT :programId AS ProgramID FROM dual) s
            ON (p.ProgramID = s.ProgramID)
            WHEN MATCHED THEN
                UPDATE SET
                    ProgramName = :programName,
                    DepartmentID = :departmentId,
                    DurationYears = :durationYears
            WHEN NOT MATCHED THEN
                INSERT (ProgramID, ProgramName, DepartmentID, DurationYears)
                VALUES (:programId, :programName, :departmentId, :durationYears)
        `;

        await connection.execute(
            sql,
            {
                programId: pId,
                programName,
                departmentId: dId,
                durationYears: years
            },
            { autoCommit: true }
        );

        clearPageDataCache();

        res.status(200).json({ message: "Program saved successfully!" });

    } catch (err) {
        console.error("PROGRAM SAVE ERROR:", err);
        res.status(500).json({ message: "Database Error: " + err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// SEMESTERS ENDPOINTS
// ===============================

app.get("/api/semesters", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT SemesterID, SemesterName
             FROM Semesters
             ORDER BY SemesterID`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(result.rows);

    } catch (err) {
        console.error("GET SEMESTERS ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// DIVISIONS ENDPOINTS
// ===============================

app.get("/api/divisions", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT DivisionID, DivisionName, SemesterID, Strength
             FROM Divisions
             ORDER BY DivisionID`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(result.rows);

    } catch (err) {
        console.error("GET DIVISIONS ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.post("/api/divisions", async (req, res) => {
    let connection;

    try {
        const divisionId =
            req.body.divisionId ?? req.body.DivisionID ?? req.body.division_id;

        const divisionName =
            req.body.divisionName ?? req.body.DivisionName ?? req.body.division_name;

        const semesterId =
            req.body.semesterId ?? req.body.SemesterID ?? req.body.semester_id;

        const strength =
            req.body.strength ?? req.body.Strength;

        const dId = Number(divisionId);
        const sId = Number(semesterId);
        const strengthNum = Number(strength);

        if (Number.isNaN(dId) || Number.isNaN(sId) || Number.isNaN(strengthNum)) {
            return res.status(400).json({
                message: "Division ID, Semester ID, and Strength must be valid numbers"
            });
        }

        connection = await getConnection();

        const sql = `
            MERGE INTO Divisions d
            USING (SELECT :divisionId AS DivisionID FROM dual) s
            ON (d.DivisionID = s.DivisionID)
            WHEN MATCHED THEN
                UPDATE SET
                    DivisionName = :divisionName,
                    SemesterID = :semesterId,
                    Strength = :strength
            WHEN NOT MATCHED THEN
                INSERT (DivisionID, DivisionName, SemesterID, Strength)
                VALUES (:divisionId, :divisionName, :semesterId, :strength)
        `;

        await connection.execute(
            sql,
            {
                divisionId: dId,
                divisionName,
                semesterId: sId,
                strength: strengthNum
            },
            { autoCommit: true }
        );

        clearPageDataCache();

        res.status(200).json({ message: "Division saved successfully!" });

    } catch (err) {
        console.error("DIVISION SAVE ERROR:", err);
        res.status(500).json({ message: "Database Error: " + err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// SUBJECTS ENDPOINTS
// ===============================

app.get("/api/subjects", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT SubjectID, SubjectCode, SubjectName, DepartmentID, SemesterID, Credits, Type, WeeklyHours
             FROM Subjects
             ORDER BY SubjectID`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(result.rows);

    } catch (err) {
        console.error("GET SUBJECTS ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.post("/api/subjects", async (req, res) => {
    let connection;

    try {
        const subjectId =
            req.body.subjectId ?? req.body.SubjectID ?? req.body.subject_id;

        const subjectCode =
            req.body.subjectCode ?? req.body.SubjectCode ?? req.body.subject_code;

        const subjectName =
            req.body.subjectName ?? req.body.SubjectName ?? req.body.subject_name;

        const departmentId =
            req.body.departmentId ?? req.body.DepartmentID ?? req.body.department_id;

        const semesterId =
            req.body.semesterId ?? req.body.SemesterID ?? req.body.semester_id;

        const credits =
            req.body.credits ?? req.body.Credits;

        const type =
            req.body.type ?? req.body.Type;

        const weeklyHours =
            req.body.weeklyHours ?? req.body.WeeklyHours ?? req.body.weekly_hours;

        const sId = Number(subjectId);
        const dId = Number(departmentId);
        const semId = Number(semesterId);
        const creditsNum = Number(credits);
        const weeklyHoursNum = Number(weeklyHours);

        if (
            Number.isNaN(sId) ||
            Number.isNaN(dId) ||
            Number.isNaN(semId) ||
            Number.isNaN(creditsNum) ||
            Number.isNaN(weeklyHoursNum)
        ) {
            return res.status(400).json({
                message: "Subject ID, Department ID, Semester ID, Credits, and Weekly Hours must be valid numbers"
            });
        }

        connection = await getConnection();

        const sql = `
            MERGE INTO Subjects s
            USING (SELECT :subjectId AS SubjectID FROM dual) src
            ON (s.SubjectID = src.SubjectID)
            WHEN MATCHED THEN
                UPDATE SET
                    SubjectCode = :subjectCode,
                    SubjectName = :subjectName,
                    DepartmentID = :departmentId,
                    SemesterID = :semesterId,
                    Credits = :credits,
                    Type = :type,
                    WeeklyHours = :weeklyHours
            WHEN NOT MATCHED THEN
                INSERT (SubjectID, SubjectCode, SubjectName, DepartmentID, SemesterID, Credits, Type, WeeklyHours)
                VALUES (:subjectId, :subjectCode, :subjectName, :departmentId, :semesterId, :credits, :type, :weeklyHours)
        `;

        await connection.execute(
            sql,
            {
                subjectId: sId,
                subjectCode,
                subjectName,
                departmentId: dId,
                semesterId: semId,
                credits: creditsNum,
                type,
                weeklyHours: weeklyHoursNum
            },
            { autoCommit: true }
        );

        clearPageDataCache();

        res.status(200).json({ message: "Subject saved successfully!" });

    } catch (err) {
        console.error("SUBJECT SAVE ERROR:", err);
        res.status(500).json({ message: "Database Error: " + err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// TIMETABLE APPROVAL ENDPOINTS
// ===============================

app.post("/api/timetable-approvals", async (req, res) => {
    let connection;

    try {
        const approvalId =
            req.body.approvalId ?? req.body.ApprovalID ?? req.body.approval_id;

        const timetableId =
            req.body.timetableId ?? req.body.TimetableID ?? req.body.timetable_id;

        const approvedBy =
            req.body.approvedBy ?? req.body.ApprovedBy ?? req.body.approved_by;

        const approvalStatus =
            req.body.approvalStatus ?? req.body.ApprovalStatus ?? req.body.approval_status;

        const comments =
            req.body.comments ?? req.body.Comments ?? null;

        const aId = Number(approvalId);
        const tId = Number(timetableId);
        const userId = Number(approvedBy);

        if (
            Number.isNaN(aId) ||
            Number.isNaN(tId) ||
            Number.isNaN(userId) ||
            !approvalStatus
        ) {
            return res.status(400).json({
                message: "Approval ID, Timetable ID, Approved By, and Status are required."
            });
        }

        const allowedStatuses = ["Approved", "Rejected"];

        if (!allowedStatuses.includes(approvalStatus)) {
            return res.status(400).json({
                message: "Approval Status must be Approved or Rejected."
            });
        }

        connection = await getConnection();

        const sql = `
            MERGE INTO TimetableApproval ta
            USING (
                SELECT
                    :approvalId AS ApprovalID,
                    :timetableId AS TimetableID,
                    :approvedBy AS ApprovedBy,
                    :approvalStatus AS ApprovalStatus,
                    :comments AS Comments
                FROM dual
            ) src
            ON (ta.ApprovalID = src.ApprovalID)
            WHEN MATCHED THEN
                UPDATE SET
                    ta.TimetableID = src.TimetableID,
                    ta.ApprovedBy = src.ApprovedBy,
                    ta.ApprovalStatus = src.ApprovalStatus,
                    ta.Comments = src.Comments,
                    ta.ApprovalDate = SYSDATE
            WHEN NOT MATCHED THEN
                INSERT (
                    ApprovalID,
                    TimetableID,
                    ApprovedBy,
                    ApprovalStatus,
                    Comments,
                    ApprovalDate
                )
                VALUES (
                    src.ApprovalID,
                    src.TimetableID,
                    src.ApprovedBy,
                    src.ApprovalStatus,
                    src.Comments,
                    SYSDATE
                )
        `;

        await connection.execute(
            sql,
            {
                approvalId: aId,
                timetableId: tId,
                approvedBy: userId,
                approvalStatus,
                comments: comments || null
            },
            { autoCommit: true }
        );

        clearPageDataCache();

        res.status(200).json({
            message: "Timetable approval saved successfully!"
        });

    } catch (err) {
        console.error("TIMETABLE APPROVAL SAVE ERROR:", err);

        if (err.message && err.message.includes("ORA-02291")) {
            return res.status(400).json({
                message: "Invalid Timetable ID or Approved By. Please select existing values."
            });
        }

        if (err.message && err.message.includes("ORA-02290")) {
            return res.status(400).json({
                message: "Invalid Approval Status."
            });
        }

        res.status(500).json({
            message: "Database Error: " + err.message
        });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// NEXT ID APIs
// ===============================

app.get("/api/programs-next-id", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT NVL(MAX(ProgramID), 0) + 1 AS NEXTID
             FROM Programs`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ nextId: result.rows[0].NEXTID });

    } catch (err) {
        console.error("PROGRAM NEXT ID ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.get("/api/divisions-next-id", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT NVL(MAX(DivisionID), 0) + 1 AS NEXTID
             FROM Divisions`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ nextId: result.rows[0].NEXTID });

    } catch (err) {
        console.error("DIVISION NEXT ID ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.get("/api/subjects-next-id", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT NVL(MAX(SubjectID), 0) + 1 AS NEXTID
             FROM Subjects`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ nextId: result.rows[0].NEXTID });

    } catch (err) {
        console.error("SUBJECT NEXT ID ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

app.get("/api/timetable-approval-next-id", async (req, res) => {
    let connection;

    try {
        connection = await getConnection();

        const result = await connection.execute(
            `SELECT NVL(MAX(ApprovalID), 0) + 1 AS NEXTID
             FROM TimetableApproval`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ nextId: result.rows[0].NEXTID });

    } catch (err) {
        console.error("TIMETABLE APPROVAL NEXT ID ERROR:", err);
        res.status(500).json({ message: err.message });

    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error(e);
            }
        }
    }
});

// ===============================
// START SERVER
// ===============================

initializePool().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
});