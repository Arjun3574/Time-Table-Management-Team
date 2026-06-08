const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve HTML files statically from the root directory
app.use(express.static(__dirname));

async function getNextSequenceId(tableName, idColumn) {
  const sql = `SELECT NVL(MAX(${idColumn}), 0) + 1 AS "nextId" FROM ${tableName}`;
  const result = await db.execute(sql);
  return result.rows[0].nextId;
}

// ============================================================================
// 1. ACADEMIC YEARS API
// ============================================================================

app.get('/api/academic-years', async (req, res) => {
  try {
    const sql = `
      SELECT academicyearid AS "id", 
             yearname AS "yearName", 
             TO_CHAR(startdate, 'YYYY-MM-DD') AS "startDate", 
             TO_CHAR(enddate, 'YYYY-MM-DD') AS "endDate", 
             iscurrent AS "isCurrent" 
      FROM academicyears 
      ORDER BY academicyearid
    `;
    const result = await db.execute(sql);
    
    // Map iscurrent (0/1) to true/false boolean
    const records = result.rows.map(row => ({
      ...row,
      isCurrent: row.isCurrent === 1
    }));
    
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/academic-years', async (req, res) => {
  try {
    const { id, yearName, startDate, endDate, isCurrent } = req.body;
    
    // If marked as current, set all others to 0 first
    if (isCurrent) {
      await db.execute('UPDATE academicyears SET iscurrent = 0', {});
    }
    
    let targetId = parseInt(id);
    if (targetId) {
      const checkSql = 'SELECT COUNT(*) AS "cnt" FROM academicyears WHERE academicyearid = :id';
      const checkResult = await db.execute(checkSql, { id: targetId });
      if (checkResult.rows[0].cnt > 0) {
        return res.status(400).json({ error: `Record with ID ${targetId} already exists.` });
      }
    } else {
      targetId = await getNextSequenceId('academicyears', 'academicyearid');
    }
    
    const sql = `
      INSERT INTO academicyears (academicyearid, yearname, startdate, enddate, iscurrent)
      VALUES (:academicyearid, :yearName, TO_DATE(:startDate, 'YYYY-MM-DD'), TO_DATE(:endDate, 'YYYY-MM-DD'), :isCurrent)
      RETURNING academicyearid INTO :id
    `;
    
    const result = await db.execute(sql, {
      academicyearid: targetId,
      yearName,
      startDate,
      endDate,
      isCurrent: isCurrent ? 1 : 0,
      id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });
    
    const newId = result.outBinds.id[0];
    res.status(201).json({ id: newId, yearName, startDate, endDate, isCurrent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/academic-years/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { yearName, startDate, endDate, isCurrent } = req.body;
    
    if (isCurrent) {
      await db.execute('UPDATE academicyears SET iscurrent = 0', {});
    }
    
    const sql = `
      UPDATE academicyears 
      SET yearname = :yearName,
          startdate = TO_DATE(:startDate, 'YYYY-MM-DD'),
          enddate = TO_DATE(:endDate, 'YYYY-MM-DD'),
          iscurrent = :isCurrent
      WHERE academicyearid = :id
    `;
    
    await db.execute(sql, {
      yearName,
      startDate,
      endDate,
      isCurrent: isCurrent ? 1 : 0,
      id
    });
    
    res.json({ id, yearName, startDate, endDate, isCurrent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 2. BUILDINGS API
// ============================================================================

app.get('/api/buildings', async (req, res) => {
  try {
    const sql = 'SELECT buildingid AS "id", buildingname AS "buildingName" FROM buildings ORDER BY buildingid';
    const result = await db.execute(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/buildings', async (req, res) => {
  try {
    const { id, buildingName } = req.body;
    let targetId = parseInt(id);
    if (targetId) {
      const checkSql = 'SELECT COUNT(*) AS "cnt" FROM buildings WHERE buildingid = :id';
      const checkResult = await db.execute(checkSql, { id: targetId });
      if (checkResult.rows[0].cnt > 0) {
        return res.status(400).json({ error: `Record with ID ${targetId} already exists.` });
      }
    } else {
      targetId = await getNextSequenceId('buildings', 'buildingid');
    }
    const sql = 'INSERT INTO buildings (buildingid, buildingname) VALUES (:buildingid, :buildingName) RETURNING buildingid INTO :id';
    
    const result = await db.execute(sql, {
      buildingid: targetId,
      buildingName,
      id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });
    
    const newId = result.outBinds.id[0];
    res.status(201).json({ id: newId, buildingName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/buildings/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { buildingName } = req.body;
    const sql = 'UPDATE buildings SET buildingname = :buildingName WHERE buildingid = :id';
    
    await db.execute(sql, { buildingName, id });
    res.json({ id, buildingName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 3. ROLES API
// ============================================================================

app.get('/api/roles', async (req, res) => {
  try {
    const sql = 'SELECT roleid AS "id", rolename AS "roleName", description AS "description", status AS "status" FROM roles ORDER BY roleid';
    const result = await db.execute(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/roles', async (req, res) => {
  try {
    const { id, roleName, description, status } = req.body;
    let targetId = parseInt(id);
    if (targetId) {
      const checkSql = 'SELECT COUNT(*) AS "cnt" FROM roles WHERE roleid = :id';
      const checkResult = await db.execute(checkSql, { id: targetId });
      if (checkResult.rows[0].cnt > 0) {
        return res.status(400).json({ error: `Record with ID ${targetId} already exists.` });
      }
    } else {
      targetId = await getNextSequenceId('roles', 'roleid');
    }
    const sql = `
      INSERT INTO roles (roleid, rolename, description, status) 
      VALUES (:roleid, :roleName, :description, :status) 
      RETURNING roleid INTO :id
    `;
    
    const result = await db.execute(sql, {
      roleid: targetId,
      roleName,
      description,
      status,
      id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });
    
    const newId = result.outBinds.id[0];
    res.status(201).json({ id: newId, roleName, description, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/roles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { roleName, description, status } = req.body;
    const sql = `
      UPDATE roles 
      SET rolename = :roleName, 
          description = :description, 
          status = :status 
      WHERE roleid = :id
    `;
    
    await db.execute(sql, { roleName, description, status, id });
    res.json({ id, roleName, description, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 4. TIMESLOTS API
// ============================================================================

app.get('/api/timeslots', async (req, res) => {
  try {
    const sql = `
      SELECT timeslotid AS "id", 
             starttime AS "startTime", 
             endtime AS "endTime", 
             slotname AS "slotName", 
             isbreak AS "isBreak" 
      FROM timeslots 
      ORDER BY timeslotid
    `;
    const result = await db.execute(sql);
    
    const records = result.rows.map(row => ({
      ...row,
      isBreak: row.isBreak === 1
    }));
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/timeslots', async (req, res) => {
  try {
    const { id, startTime, endTime, slotName, isBreak } = req.body;
    let targetId = parseInt(id);
    if (targetId) {
      const checkSql = 'SELECT COUNT(*) AS "cnt" FROM timeslots WHERE timeslotid = :id';
      const checkResult = await db.execute(checkSql, { id: targetId });
      if (checkResult.rows[0].cnt > 0) {
        return res.status(400).json({ error: `Record with ID ${targetId} already exists.` });
      }
    } else {
      targetId = await getNextSequenceId('timeslots', 'timeslotid');
    }
    const sql = `
      INSERT INTO timeslots (timeslotid, starttime, endtime, slotname, isbreak) 
      VALUES (:timeslotid, :startTime, :endTime, :slotName, :isBreak) 
      RETURNING timeslotid INTO :id
    `;
    
    const result = await db.execute(sql, {
      timeslotid: targetId,
      startTime,
      endTime,
      slotName,
      isBreak: isBreak ? 1 : 0,
      id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });
    
    const newId = result.outBinds.id[0];
    res.status(201).json({ id: newId, startTime, endTime, slotName, isBreak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/timeslots/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { startTime, endTime, slotName, isBreak } = req.body;
    const sql = `
      UPDATE timeslots 
      SET starttime = :startTime, 
          endtime = :endTime, 
          slotname = :slotName, 
          isbreak = :isBreak 
      WHERE timeslotid = :id
    `;
    
    await db.execute(sql, {
      startTime,
      endTime,
      slotName,
      isBreak: isBreak ? 1 : 0,
      id
    });
    res.json({ id, startTime, endTime, slotName, isBreak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 5. REPORTS LOG & USERS API
// ============================================================================

app.get('/api/users', async (req, res) => {
  try {
    const sql = 'SELECT userid AS "id", username AS "userName" FROM users ORDER BY userid';
    const result = await db.execute(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports-log', async (req, res) => {
  try {
    const sql = `
      SELECT r.reportlogid AS "id", 
             r.reportname AS "reportName", 
             r.generatedby AS "generatedBy", 
             u.username AS "generatedByName", 
             TO_CHAR(r.generateddate, 'YYYY-MM-DD"T"HH24:MI') AS "generatedDate", 
             r.parameters AS "parameters" 
      FROM reportslog r
      JOIN users u ON r.generatedby = u.userid
      ORDER BY r.reportlogid
    `;
    const result = await db.execute(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports-log', async (req, res) => {
  try {
    const { id, reportName, generatedBy, generatedDate, parameters } = req.body;
    let targetId = parseInt(id);
    if (targetId) {
      const checkSql = 'SELECT COUNT(*) AS "cnt" FROM reportslog WHERE reportlogid = :id';
      const checkResult = await db.execute(checkSql, { id: targetId });
      if (checkResult.rows[0].cnt > 0) {
        return res.status(400).json({ error: `Record with ID ${targetId} already exists.` });
      }
    } else {
      targetId = await getNextSequenceId('reportslog', 'reportlogid');
    }
    const sql = `
      INSERT INTO reportslog (reportlogid, reportname, generatedby, generateddate, parameters) 
      VALUES (:reportlogid, :reportName, :generatedBy, TO_TIMESTAMP(:generatedDate, 'YYYY-MM-DD HH24:MI'), :parameters) 
      RETURNING reportlogid INTO :id
    `;
    
    const result = await db.execute(sql, {
      reportlogid: targetId,
      reportName,
      generatedBy: parseInt(generatedBy),
      generatedDate: generatedDate ? generatedDate.replace('T', ' ') : null,
      parameters: parameters || null,
      id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });
    
    const newId = result.outBinds.id[0];
    res.status(201).json({ id: newId, reportName, generatedBy, generatedDate, parameters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/reports-log/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { reportName, generatedBy, generatedDate, parameters } = req.body;
    const sql = `
      UPDATE reportslog 
      SET reportname = :reportName, 
          generatedby = :generatedBy, 
          generateddate = TO_TIMESTAMP(:generatedDate, 'YYYY-MM-DD HH24:MI'), 
          parameters = :parameters 
      WHERE reportlogid = :id
    `;
    
    await db.execute(sql, {
      reportName,
      generatedBy: parseInt(generatedBy),
      generatedDate: generatedDate ? generatedDate.replace('T', ' ') : null,
      parameters: parameters || null,
      id
    });
    res.json({ id, reportName, generatedBy, generatedDate, parameters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// 6. TEACHER SUBJECT ASSIGNMENT & LOOKUPS API
// ============================================================================

app.get('/api/teachers', async (req, res) => {
  try {
    // Return teachers from users table by joining roles and filtering by role name 'Teacher'
    const sql = `
      SELECT u.userid AS "id", u.fullname AS "teacherName"
      FROM users u
      JOIN roles r ON u.roleid = r.roleid
      WHERE UPPER(r.rolename) = 'TEACHER'
      ORDER BY u.userid
    `;
    const result = await db.execute(sql);
    // `db.execute` returns objects with keys matching the SQL aliases (case-sensitive).
    // Return `id` and `teacherName` properties expected by the frontend.
    res.json(result.rows.map(r => ({ id: r.id, teacherName: r.teacherName })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subjects', async (req, res) => {
  try {
    const sql = 'SELECT subjectid AS "id", subjectname AS "subjectName" FROM subjects ORDER BY subjectid';
    const result = await db.execute(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/divisions', async (req, res) => {
  try {
    const sql = 'SELECT divisionid AS "id", divisionname AS "divisionName" FROM divisions ORDER BY divisionid';
    const result = await db.execute(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teacher-subject-assignments', async (req, res) => {
  try {
    const sql = `
      SELECT tsa.assignmentid AS "id", 
             tsa.teacherid AS "teacherID", t.fullname AS "teacher",
             tsa.subjectid AS "subjectID", s.subjectname AS "subject",
             tsa.divisionid AS "divisionID", d.divisionname AS "division",
             tsa.academicyearid AS "academicYearID", ay.yearname AS "academicYear"
      FROM teachersubjectassignment tsa
      JOIN users t ON tsa.teacherid = t.userid
      JOIN subjects s ON tsa.subjectid = s.subjectid
      JOIN divisions d ON tsa.divisionid = d.divisionid
      JOIN academicyears ay ON tsa.academicyearid = ay.academicyearid
      ORDER BY tsa.assignmentid
    `;
    const result = await db.execute(sql);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teacher-subject-assignments', async (req, res) => {
  try {
    const { id, teacherID, subjectID, divisionID, academicYearID } = req.body;
    let targetId = parseInt(id);
    if (targetId) {
      const checkSql = 'SELECT COUNT(*) AS "cnt" FROM teachersubjectassignment WHERE assignmentid = :id';
      const checkResult = await db.execute(checkSql, { id: targetId });
      if (checkResult.rows[0].cnt > 0) {
        return res.status(400).json({ error: `Record with ID ${targetId} already exists.` });
      }
    } else {
      targetId = await getNextSequenceId('teachersubjectassignment', 'assignmentid');
    }
    const sql = `
      INSERT INTO teachersubjectassignment (assignmentid, teacherid, subjectid, divisionid, academicyearid) 
      VALUES (:assignmentid, :teacherID, :subjectID, :divisionID, :academicYearID) 
      RETURNING assignmentid INTO :id
    `;
    
    const result = await db.execute(sql, {
      assignmentid: targetId,
      teacherID: parseInt(teacherID),
      subjectID: parseInt(subjectID),
      divisionID: parseInt(divisionID),
      academicYearID: parseInt(academicYearID),
      id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
    });
    
    const newId = result.outBinds.id[0];
    res.status(201).json({ id: newId, teacherID, subjectID, divisionID, academicYearID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/teacher-subject-assignments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { teacherID, subjectID, divisionID, academicYearID } = req.body;
    const sql = `
      UPDATE teachersubjectassignment 
      SET teacherid = :teacherID, 
          subjectid = :subjectID, 
          divisionid = :divisionID, 
          academicyearid = :academicYearID 
      WHERE assignmentid = :id
    `;
    
    await db.execute(sql, {
      teacherID: parseInt(teacherID),
      subjectID: parseInt(subjectID),
      divisionID: parseInt(divisionID),
      academicYearID: parseInt(academicYearID),
      id
    });
    res.json({ id, teacherID, subjectID, divisionID, academicYearID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

async function startServer() {
  try {
    await db.initialize();
    console.log('Successfully connected to Oracle Database.');
  } catch (err) {
    console.error('CRITICAL: Failed to initialize Oracle Database connection pool!');
    console.error(err.message);
    console.error('Please configure your database credentials in the .env file.');
  }

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

startServer();
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await db.close();
  process.exit(0);
});
