// Connects the dashboard to Cloud Firestore and exposes it as window.CaseServices.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDocs }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { /* analytics is optional */ }
const fs = getFirestore(app);

/* Adapter: the dashboard uses collection/doc with set, delete, get and onSnapshot. */
const wrap = d => ({ id: d.id, exists: true, data: () => d.data() });
const db = {
  collection(path) {
    const c = collection(fs, path);
    return {
      doc: id => {
        const r = doc(fs, path, id);
        return { set: data => setDoc(r, data), delete: () => deleteDoc(r) };
      },
      get: () => getDocs(c).then(s => ({ docs: s.docs.map(wrap) })),
      onSnapshot: (next, err) => onSnapshot(c, s => next({ docs: s.docs.map(wrap) }), err)
    };
  },
  doc(path) {
    const r = doc(fs, path);
    return {
      set: data => setDoc(r, data),
      onSnapshot: (next, err) =>
        onSnapshot(r, s => next({ id: s.id, exists: s.exists(), data: () => s.data() }), err)
    };
  }
};

const downloads = {
  save({ filename, data }) {
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return Promise.resolve();
  }
};

window.CaseServices = { use: async name => (name === "db" ? db : name === "downloads" ? downloads : null) };
window.dispatchEvent(new Event("services-ready"));
