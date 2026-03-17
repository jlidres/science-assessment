import { useEffect, useMemo, useState } from "react";
import { questions as defaultQuestions } from "./data/questions";
import type { AttemptRecord, Question, StudentInfo } from "./types";

const STORAGE_KEY = "science-assessment-prototype-v3";
const QUESTION_BANK_KEY = "science-question-bank-v2";
const ATTEMPTS_KEY = "science-attempts-master-v1";
const TEST_DURATION_MINUTES = 60;
const TEACHER_PASSWORD = "science123";

type SavedState = {
  student: StudentInfo | null;
  started: boolean;
  submitted: boolean;
  currentIndex: number;
  answers: Record<string, string>;
  timeLeft: number;
  questionBank: Question[];
};

type ViewMode =
  | "entry"
  | "assessment"
  | "review"
  | "submitted"
  | "editor-login"
  | "editor";

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildRandomizedQuestionBank(source: Question[]): Question[] {
  const randomizedQuestions = shuffleArray(source).map((q, index) => {
    const shuffledOptions = shuffleArray(q.options);
    const correctLabel = q.options.find((opt) => opt.value === q.correctAnswer)?.label ?? "";
    const newCorrect = shuffledOptions.find((opt) => opt.label === correctLabel)?.value ?? q.correctAnswer;

    return {
      ...q,
      number: index + 1,
      options: shuffledOptions,
      correctAnswer: newCorrect
    };
  });

  return randomizedQuestions;
}

function loadQuestionBank(): Question[] {
  try {
    const raw = localStorage.getItem(QUESTION_BANK_KEY);
    if (!raw) return defaultQuestions;
    const parsed = JSON.parse(raw) as Question[];
    return parsed.length ? parsed : defaultQuestions;
  } catch {
    return defaultQuestions;
  }
}

function loadAttempts(): AttemptRecord[] {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AttemptRecord[];
  } catch {
    return [];
  }
}

function saveAttempts(attempts: AttemptRecord[]) {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        student: null,
        started: false,
        submitted: false,
        currentIndex: 0,
        answers: {},
        timeLeft: TEST_DURATION_MINUTES * 60,
        questionBank: []
      };
    }
    return JSON.parse(raw) as SavedState;
  } catch {
    return {
      student: null,
      started: false,
      submitted: false,
      currentIndex: 0,
      answers: {},
      timeLeft: TEST_DURATION_MINUTES * 60,
      questionBank: []
    };
  }
}

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function makeAttemptId() {
  return `ATTEMPT-${Date.now()}`;
}

export default function App() {
  const saved = loadState();

  const [editableBank, setEditableBank] = useState<Question[]>(loadQuestionBank());
  const [questionBank, setQuestionBank] = useState<Question[]>(
    saved.questionBank.length ? saved.questionBank : []
  );

  const [student, setStudent] = useState<StudentInfo | null>(saved.student);
  const [started, setStarted] = useState(saved.started);
  const [submitted, setSubmitted] = useState(saved.submitted);
  const [currentIndex, setCurrentIndex] = useState(saved.currentIndex);
  const [answers, setAnswers] = useState<Record<string, string>>(saved.answers);
  const [timeLeft, setTimeLeft] = useState(saved.timeLeft);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (saved.submitted) return "submitted";
    if (saved.started) return "assessment";
    return "entry";
  });

  const [form, setForm] = useState<StudentInfo>({
    studentName: saved.student?.studentName ?? "",
    studentId: saved.student?.studentId ?? "",
    section: saved.student?.section ?? ""
  });

  const [editorPassword, setEditorPassword] = useState("");

  useEffect(() => {
    localStorage.setItem(QUESTION_BANK_KEY, JSON.stringify(editableBank));
  }, [editableBank]);

  useEffect(() => {
    const payload: SavedState = {
      student,
      started,
      submitted,
      currentIndex,
      answers,
      timeLeft,
      questionBank
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [student, started, submitted, currentIndex, answers, timeLeft, questionBank]);

  useEffect(() => {
    if (!started || submitted || viewMode === "editor" || viewMode === "editor-login") return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [started, submitted, viewMode]);

  const currentQuestion = questionBank[currentIndex];

  const answeredCount = useMemo(() => {
    return questionBank.filter((q) => !!answers[q.id]).length;
  }, [answers, questionBank]);

  const score = useMemo(() => {
    return questionBank.reduce((total, q) => {
      return total + (answers[q.id] === q.correctAnswer ? 1 : 0);
    }, 0);
  }, [answers, questionBank]);

  const percentage = useMemo(() => {
    if (!questionBank.length) return 0;
    return Math.round((score / questionBank.length) * 100);
  }, [score, questionBank]);

  function handleStart() {
    if (!form.studentName.trim() || !form.studentId.trim() || !form.section.trim()) {
      alert("Please complete Student Name, Student ID, and Section.");
      return;
    }

    const randomized = buildRandomizedQuestionBank(editableBank);

    setStudent(form);
    setStarted(true);
    setSubmitted(false);
    setCurrentIndex(0);
    setAnswers({});
    setTimeLeft(TEST_DURATION_MINUTES * 60);
    setQuestionBank(randomized);
    setViewMode("assessment");
  }

  function handleAnswer(value: string) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value
    }));
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex((prev) => prev - 1);
  }

  function goNext() {
    if (currentIndex < questionBank.length - 1) setCurrentIndex((prev) => prev + 1);
  }

  function saveAttemptRecord() {
    if (!student || !questionBank.length) return;

    const attempts = loadAttempts();

    const record: AttemptRecord = {
      attemptId: makeAttemptId(),
      submittedAt: new Date().toISOString(),
      studentName: student.studentName,
      studentId: student.studentId,
      section: student.section,
      score,
      totalItems: questionBank.length,
      percentage,
      answers,
      questionOrder: questionBank.map((q) => q.id)
    };

    attempts.push(record);
    saveAttempts(attempts);
  }

  function handleSubmit() {
    const confirmSubmit = window.confirm("Submit this test now?");
    if (!confirmSubmit) return;
    saveAttemptRecord();
    setSubmitted(true);
    setViewMode("submitted");
  }

  function handleAutoSubmit() {
    saveAttemptRecord();
    setSubmitted(true);
    setViewMode("submitted");
  }

  function jumpToQuestion(index: number) {
    setCurrentIndex(index);
    setViewMode("assessment");
  }

  function exportCurrentResultsToCsv() {
    if (!student) return;

    const rows: string[] = [];
    rows.push(
      [
        "Student Name",
        "Student ID",
        "Section",
        "Question Number",
        "Question ID",
        "Selected Answer",
        "Correct Answer",
        "Is Correct",
        "Score",
        "Percentage"
      ]
        .map(escapeCsv)
        .join(",")
    );

    questionBank.forEach((q) => {
      const selected = answers[q.id] ?? "";
      const correct = q.correctAnswer;
      const isCorrect = selected === correct ? "Yes" : "No";

      rows.push(
        [
          student.studentName,
          student.studentId,
          student.section,
          q.number,
          q.id,
          selected,
          correct,
          isCorrect,
          score,
          percentage
        ]
          .map(escapeCsv)
          .join(",")
      );
    });

    const filename = `${student.studentId}_${student.studentName.replace(/\s+/g, "_")}_science_results.csv`;
    downloadCsv(filename, rows.join("\n"));
  }

  function exportMasterCsv() {
    const attempts = loadAttempts();

    const rows: string[] = [];
    rows.push(
      [
        "Attempt ID",
        "Submitted At",
        "Student Name",
        "Student ID",
        "Section",
        "Score",
        "Total Items",
        "Percentage"
      ]
        .map(escapeCsv)
        .join(",")
    );

    attempts.forEach((a) => {
      rows.push(
        [
          a.attemptId,
          a.submittedAt,
          a.studentName,
          a.studentId,
          a.section,
          a.score,
          a.totalItems,
          a.percentage
        ]
          .map(escapeCsv)
          .join(",")
      );
    });

    downloadCsv("science_master_attempts.csv", rows.join("\n"));
  }

  function printScoreReport() {
    window.print();
  }

  function resetAll() {
    const confirmReset = window.confirm("This will clear the current student session. Continue?");
    if (!confirmReset) return;

    localStorage.removeItem(STORAGE_KEY);
    setStudent(null);
    setStarted(false);
    setSubmitted(false);
    setCurrentIndex(0);
    setAnswers({});
    setTimeLeft(TEST_DURATION_MINUTES * 60);
    setQuestionBank([]);
    setForm({
      studentName: "",
      studentId: "",
      section: ""
    });
    setViewMode("entry");
  }

  function clearAllAttempts() {
    const confirmClear = window.confirm("This will delete all saved attempts in master storage. Continue?");
    if (!confirmClear) return;
    localStorage.removeItem(ATTEMPTS_KEY);
    alert("All saved attempts were cleared.");
  }

  function updateQuestionPrompt(index: number, value: string) {
    setEditableBank((prev) =>
      prev.map((q, i) => (i === index ? { ...q, prompt: value } : q))
    );
  }

  function updateQuestionOption(index: number, optionIndex: number, value: string) {
    setEditableBank((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const updatedOptions = q.options.map((opt, oi) =>
          oi === optionIndex ? { ...opt, label: value } : opt
        );
        return { ...q, options: updatedOptions };
      })
    );
  }

  function updateCorrectAnswer(index: number, value: string) {
    setEditableBank((prev) =>
      prev.map((q, i) => (i === index ? { ...q, correctAnswer: value } : q))
    );
  }

  function resetQuestionBank() {
    const confirmReset = window.confirm("Reset the question bank to the default questions?");
    if (!confirmReset) return;
    setEditableBank(defaultQuestions);
    localStorage.setItem(QUESTION_BANK_KEY, JSON.stringify(defaultQuestions));
  }

  function openEditor() {
    setViewMode("editor-login");
  }

  function unlockEditor() {
    if (editorPassword !== TEACHER_PASSWORD) {
      alert("Incorrect teacher password.");
      return;
    }
    setEditorPassword("");
    setViewMode("editor");
  }

  if (viewMode === "editor-login") {
    return (
      <div className="page">
        <div className="entry-card">
          <h1>Teacher Access</h1>
          <p className="subtitle">Enter the teacher password to open the editor and master export tools.</p>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={editorPassword}
              onChange={(e) => setEditorPassword(e.target.value)}
            />
          </div>

          <div className="entry-actions">
            <button className="primary-btn" onClick={unlockEditor}>
              Open Editor
            </button>
            <button className="secondary-btn" onClick={() => setViewMode(started ? "assessment" : "entry")}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "editor") {
    return (
      <div className="page editor-page">
        <div className="editor-shell">
          <div className="editor-header">
            <div>
              <h1>Science Question Bank Editor</h1>
              <p>Edit prompts, options, correct answers, and master exports.</p>
            </div>
            <div className="editor-actions">
              <button className="secondary-btn" onClick={() => setViewMode(started ? "assessment" : "entry")}>
                Back
              </button>
              <button className="secondary-btn" onClick={exportMasterCsv}>
                Export Master CSV
              </button>
              <button className="secondary-btn" onClick={clearAllAttempts}>
                Clear Attempts
              </button>
              <button className="secondary-btn" onClick={resetQuestionBank}>
                Reset Bank
              </button>
            </div>
          </div>

          <div className="editor-list">
            {editableBank.map((q, qIndex) => (
              <div className="editor-card" key={q.id}>
                <h3>Item {q.number}</h3>

                <label className="editor-label">Question Prompt</label>
                <textarea
                  className="editor-textarea"
                  value={q.prompt}
                  onChange={(e) => updateQuestionPrompt(qIndex, e.target.value)}
                />

                <div className="editor-options">
                  {q.options.map((opt, optIndex) => (
                    <div className="editor-option-row" key={opt.value}>
                      <label>{opt.value.toUpperCase()}</label>
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => updateQuestionOption(qIndex, optIndex, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <label className="editor-label">Correct Answer</label>
                <select
                  className="editor-select"
                  value={q.correctAnswer}
                  onChange={(e) => updateCorrectAnswer(qIndex, e.target.value)}
                >
                  {q.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "entry") {
    return (
      <div className="page">
        <div className="entry-card">
          <h1>Science Assessment Prototype</h1>
          <p className="subtitle">40-item multiple-choice assessment</p>

          <div className="form-group">
            <label>Student Name</label>
            <input
              type="text"
              value={form.studentName}
              onChange={(e) => setForm({ ...form, studentName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Student ID</label>
            <input
              type="text"
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Section</label>
            <input
              type="text"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
            />
          </div>

          <div className="entry-actions">
            <button className="primary-btn" onClick={handleStart}>
              Start Assessment
            </button>
            <button className="secondary-btn" onClick={openEditor}>
              Teacher Tools
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "review") {
    return (
      <div className="page">
        <div className="review-shell">
          <div className="review-header">
            <div>
              <h1>Review Answers</h1>
              <p>
                Student: <strong>{student?.studentName}</strong> | Time Left: <strong>{formatTime(timeLeft)}</strong>
              </p>
            </div>
            <div className="entry-actions">
              <button className="secondary-btn" onClick={() => setViewMode("assessment")}>
                Back to Test
              </button>
              <button className="submit-btn" onClick={handleSubmit}>
                Submit Test
              </button>
            </div>
          </div>

          <div className="review-grid">
            {questionBank.map((q, index) => {
              const isAnswered = !!answers[q.id];
              return (
                <button
                  key={q.id}
                  className={`review-item ${isAnswered ? "answered" : "unanswered"} ${index === currentIndex ? "current" : ""}`}
                  onClick={() => jumpToQuestion(index)}
                >
                  {q.number}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "submitted" && student) {
    return (
      <div className="page">
        <div className="summary-card printable-report">
          <h1>Assessment Submitted</h1>
          <p><strong>Student:</strong> {student.studentName}</p>
          <p><strong>Student ID:</strong> {student.studentId}</p>
          <p><strong>Section:</strong> {student.section}</p>
          <p><strong>Answered:</strong> {answeredCount} / {questionBank.length}</p>
          <p><strong>Score:</strong> {score} / {questionBank.length}</p>
          <p><strong>Percentage:</strong> {percentage}%</p>
          <p><strong>Remaining Time:</strong> {formatTime(timeLeft)}</p>

          <div className="entry-actions no-print">
            <button className="primary-btn" onClick={exportCurrentResultsToCsv}>
              Export Current CSV
            </button>
            <button className="secondary-btn" onClick={printScoreReport}>
              Print Score Report
            </button>
            <button className="secondary-btn" onClick={openEditor}>
              Teacher Tools
            </button>
            <button className="secondary-btn" onClick={resetAll}>
              Reset Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="page">
      <div className="assessment-shell">
        <header className="topbar">
          <div>
            <h1>Science Assessment</h1>
            <p className="topbar-meta">
              {student?.studentName} | {student?.studentId} | {student?.section}
            </p>
          </div>
          <div className="topbar-right">
            <div>Answered: {answeredCount} / {questionBank.length}</div>
            <div className={`timer ${timeLeft <= 300 ? "timer-warning" : ""}`}>
              Time Left: {formatTime(timeLeft)}
            </div>
          </div>
        </header>

        <main className="question-card">
          <div className="question-meta">
            Item {currentQuestion.number} of {questionBank.length}
          </div>

          <h2 className="question-text">{currentQuestion.prompt}</h2>

          <div className="choice-list">
            {currentQuestion.options.map((option) => (
              <label className="choice" key={option.value}>
                <input
                  type="radio"
                  name={currentQuestion.id}
                  value={option.value}
                  checked={answers[currentQuestion.id] === option.value}
                  onChange={(e) => handleAnswer(e.target.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </main>

        <footer className="bottom-bar">
          <button className="secondary-btn" onClick={goPrev} disabled={currentIndex === 0}>
            Previous
          </button>

          <div className="bottom-center multi-actions">
            <button className="secondary-btn" onClick={() => setViewMode("review")}>
              Review
            </button>
            <button className="secondary-btn" onClick={openEditor}>
              Teacher Tools
            </button>
            {currentIndex < questionBank.length - 1 ? (
              <button className="primary-btn" onClick={goNext}>
                Next
              </button>
            ) : (
              <button className="submit-btn" onClick={() => setViewMode("review")}>
                Review Before Submit
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}