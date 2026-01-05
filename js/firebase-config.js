// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, get, child } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// Suas credenciais (Já adicionei a databaseURL correta baseada no seu ID)
const firebaseConfig = {
    apiKey: "AIzaSyAIQlxWYxc9EyHP_CAHBcSsgDWGtzEDSeM",
    authDomain: "stopgameai.firebaseapp.com",
    projectId: "stopgameai",
    storageBucket: "stopgameai.firebasestorage.app",
    messagingSenderId: "213652886756",
    appId: "1:213652886756:web:b66c162a825c5adf7908f1",
    databaseURL: "https://stopgameai-default-rtdb.firebaseio.com/" 
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

console.log("🔥 Firebase Conectado com Sucesso!");

// Exportamos as ferramentas para o jogo usar
export { db, ref, set, push, onValue, update, get, child };