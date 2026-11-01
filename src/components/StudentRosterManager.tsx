import React, { useState, useRef, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Upload, 
  Download, 
  Search, 
  Trash2, 
  CheckCircle2, 
  Star, 
  StarOff, 
  FileText,
  FileSpreadsheet,
  AlertCircle,
  X,
  ArrowRight,
  RefreshCw,
  Check,
  Sparkles,
  Pencil
} from 'lucide-react';
import { StudentProfile } from '../types/attendance';

interface StudentRosterManagerProps {
  students: StudentProfile[];
  canManageCR?: boolean;
  onAddStudent: (student: StudentProfile) => void;
  onUpdateStudent?: (originalRollNo: string, updatedStudent: StudentProfile) => void;
  onBulkAddStudents: (newStudents: StudentProfile[]) => void;
  onReplaceStudents?: (newRoster: StudentProfile[]) => void;
  onToggleCR: (rollNo: string) => void;
  onDeleteStudent: (rollNo: string) => void;
}

interface ColumnMapping {
  rollNoCol: string;
  nameCol: string;
  emailCol: string;
  semesterCol: string;
  batchCol: string;
  roleCol: string;
}

// RFC-4180 compliant CSV line parser supporting quoted fields with commas
function parseCsvRow(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((val) => val.replace(/^["']|["']$/g, '').trim());
}

function parseCsvContent(rawContent: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = rawContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Detect delimiter (comma, tab, or semicolon)
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : firstLine.split(';').length > firstLine.split(',').length
    ? ';'
    : ',';

  const rawHeaders = parseCsvRow(firstLine, delimiter);
  const headers = rawHeaders.map((h, idx) => h || `Column ${idx + 1}`);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i], delimiter);
    if (values.every((v) => !v)) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

function autoDetectMapping(headers: string[]): ColumnMapping {
  const findCol = (keywords: string[], excludeKeywords: string[] = []): string => {
    for (const kw of keywords) {
      const match = headers.find((h) => {
        const lower = h.toLowerCase();
        const excluded = excludeKeywords.some((ex) => lower.includes(ex));
        return !excluded && lower.includes(kw);
      });
      if (match) return match;
    }
    return '';
  };

  return {
    rollNoCol: findCol(['roll', 'enrollment', 'reg', 'id', 'scholar id'], ['email', 'timestamp']),
    nameCol: findCol(['name', 'student', 'scholar', 'candidate'], ['father', 'mother', 'batch']),
    emailCol: findCol(['email', 'gmail', 'mail', 'e-mail']),
    semesterCol: findCol(['semester', 'sem', 'term', 'year']),
    batchCol: findCol(['batch', 'cohort', 'session', 'programme', 'program']),
    roleCol: findCol(['role', 'cr', 'representative', 'designation', 'status']),
  };
}

export const StudentRosterManager: React.FC<StudentRosterManagerProps> = ({
  students,
  canManageCR = false,
  onAddStudent,
  onUpdateStudent,
  onBulkAddStudents,
  onReplaceStudents,
  onToggleCR,
  onDeleteStudent,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [isCsvUploadModalOpen, setIsCsvUploadModalOpen] = useState<boolean>(false);
  const [importSuccessBanner, setImportSuccessBanner] = useState<string | null>(null);

  // Edit Existing Student Modal State
  const [editingOriginalRoll, setEditingOriginalRoll] = useState<string | null>(null);
  const [editRollNo, setEditRollNo] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editSemester, setEditSemester] = useState<string>('Sem 4');
  const [editBatch, setEditBatch] = useState<string>('B.Sc./M.Sc. 2026');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editIsCR, setEditIsCR] = useState<boolean>(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Single Add Form state
  const [rollNo, setRollNo] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [semester, setSemester] = useState<string>('Sem 4');
  const [batch, setBatch] = useState<string>('B.Sc./M.Sc. 2026');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [isCR, setIsCR] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk text import state
  const [bulkCsvText, setBulkCsvText] = useState<string>(
`26ugchem013, Ramesh Patel, Sem 4, B.Sc./M.Sc. 2026, ramesh@cuk.ac.in
26ugchem014, Fatima Sheikh, Sem 4, B.Sc./M.Sc. 2026, fatima@cuk.ac.in
26ugchem015, Sandeep Nair, Sem 4, B.Sc./M.Sc. 2026, sandeep@cuk.ac.in`
  );

  // CSV File Upload & Google Form Mapping Modal State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    rollNoCol: '',
    nameCol: '',
    emailCol: '',
    semesterCol: '',
    batchCol: '',
    roleCol: '',
  });
  const [defaultSemester, setDefaultSemester] = useState<string>('Sem 4');
  const [defaultBatch, setDefaultBatch] = useState<string>('M.Sc. 2024-26');
  const [importMode, setImportMode] = useState<'append' | 'upsert' | 'replace'>('append');
  const [csvUploadError, setCsvUploadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.rollNo.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.semester.toLowerCase().includes(q) ||
      s.batch.toLowerCase().includes(q) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  });

  // Process CSV content into headers, rows, and auto-mapped columns
  const loadCsvData = (content: string, sourceName: string) => {
    setCsvUploadError(null);
    const { headers, rows } = parseCsvContent(content);

    if (headers.length === 0 || rows.length === 0) {
      setCsvUploadError('The uploaded CSV file appears to be empty or is missing data rows.');
      setCsvHeaders([]);
      setCsvRows([]);
      return;
    }

    setUploadedFileName(sourceName);
    setCsvHeaders(headers);
    setCsvRows(rows);
    setColumnMapping(autoDetectMapping(headers));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        loadCsvData(text, file.name);
      }
    };
    reader.onerror = () => {
      setCsvUploadError('Failed to read the selected CSV file. Please try again.');
    };
    reader.readAsText(file);
  };

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        loadCsvData(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  // Load sample Google Form response CSV for testing or quick preview
  const handleLoadSampleGoogleForm = () => {
    const sampleCsv = `Timestamp,Email Address,Enrollment / Roll Number,Full Name,Current Semester,Batch Cohort,Role Designation
2026/10/20 9:14:22 AM GMT+5:30,sukhdevthory011@gmail.com,26ugchem005,Sukhdev Thory,Sem 4,B.Sc./M.Sc. 2026,CR
2026/10/20 9:16:05 AM GMT+5:30,ananya.deshmukh@cuk.ac.in,26ugchem013,Ananya Deshmukh,Sem 4,B.Sc./M.Sc. 2026,Student
2026/10/20 9:18:49 AM GMT+5:30,rohit.kulkarni@cuk.ac.in,26ugchem014,Rohit Kulkarni,Sem 4,B.Sc./M.Sc. 2026,Student
2026/10/20 9:21:10 AM GMT+5:30,meera.nair@cuk.ac.in,26ugchem015,Meera Nair,Sem 2,B.Sc./M.Sc. 2026,Student
2026/10/20 9:25:33 AM GMT+5:30,kiran.patil@cuk.ac.in,26ugchem016,Kiran Patil,Sem 2,B.Sc./M.Sc. 2026,CR`;
    loadCsvData(sampleCsv, 'Google_Form_Responses_Sample.csv');
  };

  // Download a blank Google Form compatible CSV template
  const handleDownloadTemplate = () => {
    const templateRows = [
      ['Timestamp', 'Roll No', 'Name', 'Email', 'Semester', 'Batch', 'Role'],
      ['2026-10-20 10:00:00', '26ugchem001', 'Aarav Sharma', 'aarav.cuk@gmail.com', 'Sem 4', 'B.Sc./M.Sc. 2026', 'CR'],
      ['2026-10-20 10:02:00', '26ugchem002', 'Priya Sundaram', 'priya.cuk@gmail.com', 'Sem 4', 'B.Sc./M.Sc. 2026', 'Student'],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + templateRows.map((r) => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'CUK_Google_Form_Student_Import_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Compute live mapped students preview from CSV rows + columnMapping
  const mappedPreview = useMemo(() => {
    if (csvRows.length === 0) {
      return {
        validStudents: [] as StudentProfile[],
        newStudents: [] as StudentProfile[],
        existingCollisions: 0,
        invalidRowsCount: 0,
      };
    }

    const validStudents: StudentProfile[] = [];
    const seenRolls = new Set<string>();
    let invalidRowsCount = 0;
    let existingCollisions = 0;

    for (const row of csvRows) {
      const rawRoll = columnMapping.rollNoCol ? row[columnMapping.rollNoCol] || '' : '';
      const rawName = columnMapping.nameCol ? row[columnMapping.nameCol] || '' : '';
      const rawEmail = columnMapping.emailCol ? row[columnMapping.emailCol] || '' : '';
      const rawSem = columnMapping.semesterCol ? row[columnMapping.semesterCol] || '' : '';
      const rawBatch = columnMapping.batchCol ? row[columnMapping.batchCol] || '' : '';
      const rawRole = columnMapping.roleCol ? row[columnMapping.roleCol] || '' : '';

      const cleanRoll = rawRoll.trim().toUpperCase();
      const cleanName = rawName.trim();

      if (!cleanRoll || !cleanName || seenRolls.has(cleanRoll)) {
        invalidRowsCount++;
        continue;
      }

      seenRolls.add(cleanRoll);

      // Normalize Semester value
      let normalizedSem = rawSem.trim() || defaultSemester;
      if (/^[1-4]$/.test(normalizedSem)) {
        normalizedSem = `Sem ${normalizedSem}`;
      } else if (/^semester\s*([1-4])$/i.test(normalizedSem)) {
        const match = normalizedSem.match(/([1-4])/);
        if (match) normalizedSem = `Sem ${match[1]}`;
      }

      const isCrDesignation =
        canManageCR && /\b(cr|class representative|yes|true)\b/i.test(rawRole.trim());

      const existsInCurrentRoster = students.some(
        (s) => s.rollNo.toUpperCase() === cleanRoll
      );
      if (existsInCurrentRoster) {
        existingCollisions++;
      }

      validStudents.push({
        rollNo: cleanRoll,
        name: cleanName,
        email: rawEmail.trim() || undefined,
        semester: normalizedSem,
        batch: rawBatch.trim() || defaultBatch,
        isCR: isCrDesignation,
      });
    }

    const newStudents = validStudents.filter(
      (candidate) => !students.some((s) => s.rollNo.toUpperCase() === candidate.rollNo)
    );

    return {
      validStudents,
      newStudents,
      existingCollisions,
      invalidRowsCount,
    };
  }, [csvRows, columnMapping, defaultSemester, defaultBatch, students, canManageCR]);

  const handleConfirmCsvUploadImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!columnMapping.rollNoCol || !columnMapping.nameCol) {
      setCsvUploadError('Please map at least the Roll No and Name columns from your CSV.');
      return;
    }

    if (mappedPreview.validStudents.length === 0) {
      setCsvUploadError('No valid student rows found to import. Check your column mappings.');
      return;
    }

    if (importMode === 'replace' && onReplaceStudents) {
      onReplaceStudents(mappedPreview.validStudents);
      setImportSuccessBanner(
        `Replaced roster with ${mappedPreview.validStudents.length} students from "${uploadedFileName}".`
      );
    } else if (importMode === 'upsert' && onReplaceStudents) {
      const uploadedMap = new Map(
        mappedPreview.validStudents.map((s) => [s.rollNo.toUpperCase(), s])
      );
      const updatedExisting = students.map((existing) => {
        const replacement = uploadedMap.get(existing.rollNo.toUpperCase());
        if (replacement) {
          uploadedMap.delete(existing.rollNo.toUpperCase());
          return {
            ...existing,
            ...replacement,
            isCR: canManageCR ? replacement.isCR : existing.isCR,
          };
        }
        return existing;
      });
      const brandNew = Array.from(uploadedMap.values());
      onReplaceStudents([...brandNew, ...updatedExisting]);
      setImportSuccessBanner(
        `Onboarded ${brandNew.length} new students and updated ${mappedPreview.existingCollisions} existing records from "${uploadedFileName}".`
      );
    } else {
      if (mappedPreview.newStudents.length === 0) {
        setCsvUploadError(
          'All students in this CSV already exist in the roster. Switch Import Mode to "Update & Merge" or "Replace Entire Roster" to overwrite.'
        );
        return;
      }
      onBulkAddStudents(mappedPreview.newStudents);
      setImportSuccessBanner(
        `Successfully imported ${mappedPreview.newStudents.length} new students from "${uploadedFileName}".`
      );
    }

    setIsCsvUploadModalOpen(false);
    setCsvHeaders([]);
    setCsvRows([]);
    setUploadedFileName('');
  };

  const normalizeRollId = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^26ugchem\d+$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    return trimmed;
  };

  const handleOpenEditModal = (student: StudentProfile) => {
    setEditingOriginalRoll(student.rollNo);
    setEditRollNo(student.rollNo);
    setEditName(student.name);
    setEditSemester(student.semester);
    setEditBatch(student.batch);
    setEditEmail(student.email || '');
    setEditPhone(student.phone || '');
    setEditIsCR(Boolean(student.isCR));
    setEditFormError(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOriginalRoll) return;

    const cleanRoll = normalizeRollId(editRollNo);
    const cleanName = editName.trim();

    if (!cleanRoll || !cleanName) {
      setEditFormError('Student ID and Full Name are required.');
      return;
    }

    const duplicateExists = students.some(
      (s) =>
        s.rollNo.toLowerCase() === cleanRoll.toLowerCase() &&
        s.rollNo.toLowerCase() !== editingOriginalRoll.toLowerCase()
    );

    if (duplicateExists) {
      setEditFormError(`Another student already uses ID "${cleanRoll}". Please choose a unique ID.`);
      return;
    }

    const existingTarget = students.find(
      (s) => s.rollNo.toLowerCase() === editingOriginalRoll.toLowerCase()
    );
    const resolvedIsCR = canManageCR ? editIsCR : Boolean(existingTarget?.isCR);

    const updatedStudent: StudentProfile = {
      rollNo: cleanRoll,
      crId: resolvedIsCR ? cleanRoll : undefined,
      name: cleanName,
      semester: editSemester,
      batch: editBatch.trim() || 'B.Sc./M.Sc. 2026',
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      isCR: resolvedIsCR,
    };

    if (onUpdateStudent) {
      onUpdateStudent(editingOriginalRoll, updatedStudent);
    } else if (onReplaceStudents) {
      onReplaceStudents(
        students.map((s) =>
          s.rollNo.toLowerCase() === editingOriginalRoll.toLowerCase() ? updatedStudent : s
        )
      );
    }

    setImportSuccessBanner(
      `Updated student record: ${updatedStudent.name} (${updatedStudent.rollNo}).`
    );
    setEditingOriginalRoll(null);
    setEditFormError(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoll = normalizeRollId(rollNo);
    const cleanName = name.trim();

    if (!cleanRoll || !cleanName) {
      setFormError('Student ID and Full Name are required.');
      return;
    }

    if (students.some((s) => s.rollNo.toLowerCase() === cleanRoll.toLowerCase())) {
      setFormError(`Student with ID ${cleanRoll} already exists!`);
      return;
    }

    const assignedIsCR = canManageCR ? isCR : false;

    onAddStudent({
      rollNo: cleanRoll,
      crId: assignedIsCR ? cleanRoll : undefined,
      name: cleanName,
      semester,
      batch,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      isCR: assignedIsCR,
    });

    // Reset and close
    setRollNo('');
    setName('');
    setEmail('');
    setPhone('');
    setIsCR(false);
    setFormError(null);
    setIsAddModalOpen(false);
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCsvText.trim()) return;

    const lines = bulkCsvText.trim().split('\n');
    const newStudents: StudentProfile[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length >= 2) {
        const roll = parts[0].toUpperCase();
        const studentName = parts[1];
        const sem = parts[2] || 'Sem 4';
        const batchName = parts[3] || 'M.Sc. 2024-26';
        const mail = parts[4] || '';

        // Ignore if already exists in existing roster or newly parsed list
        if (!students.some((s) => s.rollNo === roll) && !newStudents.some((s) => s.rollNo === roll)) {
          newStudents.push({
            rollNo: roll,
            name: studentName,
            semester: sem,
            batch: batchName,
            email: mail || undefined,
            isCR: false,
          });
        }
      }
    }

    if (newStudents.length > 0) {
      onBulkAddStudents(newStudents);
      setImportSuccessBanner(`Imported ${newStudents.length} students via quick text paste.`);
      setIsBulkModalOpen(false);
    }
  };

  // Export Roster as CSV
  const handleExportRoster = () => {
    const headers = ['Roll Number', 'Full Name', 'Semester', 'Batch', 'Email', 'Is Class Representative'];
    const rows = students.map((s) => [
      `"${s.rollNo}"`,
      `"${s.name}"`,
      `"${s.semester}"`,
      `"${s.batch}"`,
      `"${s.email || ''}"`,
      s.isCR ? 'YES' : 'NO',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CUK_Chemistry_Student_Roster_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
            Department Directory & Roster
          </div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Registered Chemistry Scholars ({students.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Add single students, upload Google Form CSV exports, and designate Class Representatives (CR) with dual permissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="cursor-pointer px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Student
          </button>
          <button
            type="button"
            onClick={() => {
              setCsvUploadError(null);
              setIsCsvUploadModalOpen(true);
            }}
            className="cursor-pointer px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Upload CSV (Google Form)
          </button>
          <button
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            className="cursor-pointer px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Paste CSV Text
          </button>
          <button
            type="button"
            onClick={handleExportRoster}
            className="cursor-pointer px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
            title="Download full student directory CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Success Banner after CSV Onboarding */}
      {importSuccessBanner && (
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccessBanner(null)}
            className="cursor-pointer text-emerald-700 hover:text-emerald-950 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roll, student name, email, batch..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="text-xs text-slate-500 hidden sm:block">
          Showing <span className="font-bold text-slate-800">{filteredStudents.length}</span> of {students.length} students
        </div>
      </div>

      {/* Student List Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Student ID</th>
              <th className="py-3 px-4">Student Name</th>
              <th className="py-3 px-4">Academic Semester</th>
              <th className="py-3 px-4">Batch</th>
              <th className="py-3 px-4">Email &amp; Phone</th>
              <th className="py-3 px-4">Role / CR Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No students found matching your search. Add a new student or upload a Google Form CSV above!
                </td>
              </tr>
            ) : (
              filteredStudents.map((s) => (
                <tr key={s.rollNo} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {s.rollNo}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    {s.name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {s.semester}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {s.batch}
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                    <div>{s.email || '—'}</div>
                    {s.phone && <div className="text-[10px] text-slate-400">{s.phone}</div>}
                  </td>
                  <td className="py-3 px-4">
                    {canManageCR ? (
                      <button
                        type="button"
                        onClick={() => onToggleCR(s.rollNo)}
                        className={`cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                          s.isCR
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                        title={s.isCR ? 'Revoke CR status' : 'Appoint as Class Representative'}
                      >
                        {s.isCR ? (
                          <>
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                            <span>Class Representative (CR)</span>
                          </>
                        ) : (
                          <>
                            <StarOff className="w-3.5 h-3.5 text-slate-400" />
                            <span>Standard Scholar</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold ${
                          s.isCR
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                        title="Only a Class Representative (CR) has the right to change CR status"
                      >
                        {s.isCR ? (
                          <>
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                            <span>Class Representative (CR)</span>
                          </>
                        ) : (
                          <>
                            <StarOff className="w-3.5 h-3.5 text-slate-400" />
                            <span>Standard Scholar</span>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(s)}
                        className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] transition-colors"
                        title="Edit Student ID, Name, Email, Phone, or Batch"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                      {(!s.isCR || canManageCR) && (
                        <button
                          type="button"
                          onClick={() => onDeleteStudent(s.rollNo)}
                          className="cursor-pointer text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                          title="Remove student from roster"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Edit Existing Student ID & Profile Anytime */}
      {editingOriginalRoll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm">Edit Student ID &amp; Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingOriginalRoll(null)}
                className="cursor-pointer text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 text-xs">
              {editFormError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editFormError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Student / CR ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 26ugchem001"
                  value={editRollNo}
                  onChange={(e) => setEditRollNo(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Updating the ID automatically syncs with existing attendance records.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Full Student Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Sharma"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Semester</label>
                  <select
                    value={editSemester}
                    onChange={(e) => setEditSemester(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Sem 1">Semester 1</option>
                    <option value="Sem 2">Semester 2</option>
                    <option value="Sem 3">Semester 3</option>
                    <option value="Sem 4">Semester 4</option>
                    <option value="Ph.D. Scholar">Ph.D. Scholar</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Batch Cohort</label>
                  <input
                    type="text"
                    value={editBatch}
                    onChange={(e) => setEditBatch(e.target.value)}
                    placeholder="e.g. B.Sc./M.Sc. 2026"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. scholar@cuk.ac.in"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 94801 23456"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Class Representative (CR)</div>
                  <div className="text-[11px] text-slate-500">
                    {canManageCR
                      ? 'Enable CR session & attendance coordination'
                      : 'Only a Class Representative (CR) has the right to change CR status'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!canManageCR}
                  checked={editIsCR}
                  onChange={(e) => {
                    if (canManageCR) setEditIsCR(e.target.checked);
                  }}
                  className="w-4 h-4 accent-indigo-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingOriginalRoll(null)}
                  className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Single Student */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">Add New Chemistry Scholar</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Student ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 26ugchem013"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Full Student Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikramaditya Reddy"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Semester</label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Sem 1">Semester 1</option>
                    <option value="Sem 2">Semester 2</option>
                    <option value="Sem 3">Semester 3</option>
                    <option value="Sem 4">Semester 4</option>
                    <option value="Ph.D. Scholar">Ph.D. Scholar</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Batch Cohort</label>
                  <input
                    type="text"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder="e.g. B.Sc./M.Sc. 2026"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. scholar@cuk.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 94801 23456"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Designate as Class Representative (CR)</div>
                  <div className="text-[11px] text-slate-500">
                    {canManageCR
                      ? 'Enable CR session & attendance coordination'
                      : 'Only a Class Representative (CR) has the right to designate a CR'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!canManageCR}
                  checked={canManageCR ? isCR : false}
                  onChange={(e) => {
                    if (canManageCR) setIsCR(e.target.checked);
                  }}
                  className="w-4 h-4 accent-indigo-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                >
                  Save to Roster
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: CSV File Upload & Google Form Column Mapper */}
      {isCsvUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 sm:px-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-400/30">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base">
                    Google Form & CSV File Bulk Student Onboarding
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Upload a `.csv` file exported from Google Forms/Sheets and map columns to Roll No, Name, Email & Semester
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCsvUploadModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCsvUploadImport} className="p-5 sm:p-6 space-y-5 text-xs max-h-[82vh] overflow-y-auto">
              {csvUploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{csvUploadError}</span>
                </div>
              )}

              {/* Step 1: File Dropzone & Template Actions */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-slate-700 uppercase tracking-wider">
                    1. Select or Drop Google Form CSV Export File
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoadSampleGoogleForm}
                      className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-[11px] transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Load Sample Google Form CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold text-[11px] transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Download Template CSV
                    </button>
                  </div>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={handleDropFile}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition-all ${
                    isDraggingFile
                      ? 'border-emerald-500 bg-emerald-50/70'
                      : uploadedFileName
                      ? 'border-emerald-300 bg-emerald-50/30'
                      : 'border-slate-300 hover:border-indigo-400 bg-slate-50/60'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <Upload className={`w-6 h-6 ${uploadedFileName ? 'text-emerald-600' : 'text-slate-400'}`} />
                    {uploadedFileName ? (
                      <>
                        <div className="font-bold text-emerald-900 text-xs">
                          Loaded File: <span className="font-mono underline">{uploadedFileName}</span>
                        </div>
                        <div className="text-[11px] text-emerald-700">
                          Detected {csvHeaders.length} columns and {csvRows.length} response rows · Click to choose a different file
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-700">
                          Click to upload <span className="text-indigo-600 font-bold">.CSV file</span> or drag and drop here
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Supports direct Google Forms / Google Sheets CSV exports (Roll No, Name, Email, Semester, Batch, CR Role)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2: Column Mapping Configuration (shown once CSV headers are loaded) */}
              {csvHeaders.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-700 uppercase tracking-wider">
                        2. Map CSV Columns to Student Profile Fields
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Columns were auto-matched from your CSV headers. Adjust any dropdown below if needed.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setColumnMapping(autoDetectMapping(csvHeaders))}
                      className="cursor-pointer self-start sm:self-auto inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Re-run Auto-Match
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    {/* Roll No Mapping */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Roll No Column <span className="text-rose-600">*</span>
                      </label>
                      <select
                        value={columnMapping.rollNoCol}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, rollNoCol: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Select CSV Column --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Full Name Mapping */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Student Name Column <span className="text-rose-600">*</span>
                      </label>
                      <select
                        value={columnMapping.nameCol}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, nameCol: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Select CSV Column --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Email Mapping */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Email Column <span className="text-indigo-600">(Google Auth)</span>
                      </label>
                      <select
                        value={columnMapping.emailCol}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, emailCol: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Optional / Not Mapped --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Semester Mapping */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Semester Column
                      </label>
                      <select
                        value={columnMapping.semesterCol}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, semesterCol: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Use Default Semester --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Batch Mapping */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Batch / Cohort Column
                      </label>
                      <select
                        value={columnMapping.batchCol}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, batchCol: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Use Default Batch --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* CR / Role Mapping */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Role / CR Status Column
                      </label>
                      <select
                        value={columnMapping.roleCol}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, roleCol: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Standard Scholar Default --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Fallback Defaults & Roster Sync Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block font-bold text-slate-700 text-[11px] uppercase mb-1">
                        Fallback Semester (if blank)
                      </label>
                      <select
                        value={defaultSemester}
                        onChange={(e) => setDefaultSemester(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="Sem 1">Sem 1</option>
                        <option value="Sem 2">Sem 2</option>
                        <option value="Sem 3">Sem 3</option>
                        <option value="Sem 4">Sem 4</option>
                        <option value="Ph.D. Scholar">Ph.D. Scholar</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 text-[11px] uppercase mb-1">
                        Fallback Batch Cohort
                      </label>
                      <input
                        type="text"
                        value={defaultBatch}
                        onChange={(e) => setDefaultBatch(e.target.value)}
                        placeholder="e.g. M.Sc. 2024-26"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 text-[11px] uppercase mb-1">
                        Roster Import Mode
                      </label>
                      <select
                        value={importMode}
                        onChange={(e) =>
                          setImportMode(e.target.value as 'append' | 'upsert' | 'replace')
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-800"
                      >
                        <option value="append">Append New Students Only</option>
                        {onReplaceStudents && (
                          <option value="upsert">Update Existing & Add New</option>
                        )}
                        {onReplaceStudents && (
                          <option value="replace">Replace Entire Roster with CSV</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Step 3: Live Mapped Preview & Validation Stats */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-700 uppercase tracking-wider">
                        3. Mapped Student Preview ({mappedPreview.validStudents.length} Valid Records)
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          New: {mappedPreview.newStudents.length}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                          Already in Roster: {mappedPreview.existingCollisions}
                        </span>
                        {mappedPreview.invalidRowsCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                            Skipped/Incomplete: {mappedPreview.invalidRowsCount}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase">
                            <th className="py-2 px-3">Roll No</th>
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Email</th>
                            <th className="py-2 px-3">Semester</th>
                            <th className="py-2 px-3">Batch</th>
                            <th className="py-2 px-3">Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mappedPreview.validStudents.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-400">
                                Select valid Roll No and Student Name columns above to preview mapped records.
                              </td>
                            </tr>
                          ) : (
                            mappedPreview.validStudents.slice(0, 15).map((st) => (
                              <tr key={st.rollNo} className="hover:bg-slate-50">
                                <td className="py-1.5 px-3 font-mono font-bold text-slate-900">
                                  {st.rollNo}
                                </td>
                                <td className="py-1.5 px-3 font-medium text-slate-800">
                                  {st.name}
                                </td>
                                <td className="py-1.5 px-3 font-mono text-slate-500">
                                  {st.email || '—'}
                                </td>
                                <td className="py-1.5 px-3 text-slate-600">{st.semester}</td>
                                <td className="py-1.5 px-3 text-slate-500">{st.batch}</td>
                                <td className="py-1.5 px-3">
                                  {st.isCR ? (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                                      CR
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">Student</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {mappedPreview.validStudents.length > 15 && (
                      <div className="text-[11px] text-slate-500 text-right">
                        Showing first 15 of {mappedPreview.validStudents.length} valid students
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div className="text-[11px] text-slate-500">
                  Changes are automatically persisted to local storage.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCsvUploadModalOpen(false)}
                    className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mappedPreview.validStudents.length === 0}
                    className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {importMode === 'replace'
                        ? `Replace Roster (${mappedPreview.validStudents.length})`
                        : importMode === 'upsert'
                        ? `Sync & Onboard (${mappedPreview.validStudents.length})`
                        : `Onboard Students (${mappedPreview.newStudents.length})`}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bulk CSV Text Paste Import */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">Bulk Import Students (CSV / Text)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Paste Student Records (One per line)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Format: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono">Roll No, Full Name, Semester, Batch, Email</code>
                </p>
                <textarea
                  rows={8}
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="cursor-pointer px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs"
                >
                  Import All Students
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

