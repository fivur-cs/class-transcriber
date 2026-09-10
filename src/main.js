const translations = {
  en: {
    subtitle: "Local audio and video transcription",
    dropTitle: "Drop an audio or video file here",
    dropDescription: "or choose a file from your computer",
    selectFile: "Select file",
    fileReady: "Ready to transcribe",
    change: "Change",
    transcribe: "Transcribe",
    show: "Show in folder",
    privacy: "Your files stay on your device.",

    stages: {
      idle: "",
      preparing: "Preparing...",
      extracting: "Preparing audio...",
      transcribing: "Transcribing with Whisper...",
      saving: "Saving transcript...",
      done: "Transcription complete",
      error: "Transcription failed"
    }
  },

  es: {
    subtitle: "Transcripción local de audio y vídeo",
    dropTitle: "Arrastra un archivo de audio o vídeo aquí",
    dropDescription: "o selecciona un archivo desde tu equipo",
    selectFile: "Seleccionar archivo",
    fileReady: "Listo para transcribir",
    change: "Cambiar",
    transcribe: "Transcribir",
    show: "Mostrar en carpeta",
    privacy: "Tus archivos permanecen en tu dispositivo.",

    stages: {
      idle: "",
      preparing: "Preparando...",
      extracting: "Preparando audio...",
      transcribing: "Transcribiendo con Whisper...",
      saving: "Guardando transcripción...",
      done: "Transcripción completada",
      error: "La transcripción falló"
    }
  }
};

let currentLanguage = "en";
let currentStage = "idle";

let selectedPath = null;
let outputPath = null;
let currentError = null;

const subtitle =
  document.querySelector("#subtitle");

const dropZone =
  document.querySelector("#dropZone");

const dropTitle =
  document.querySelector("#dropTitle");

const dropDescription =
  document.querySelector("#dropDescription");

const selectButton =
  document.querySelector("#selectButton");

const filePanel =
  document.querySelector("#filePanel");

const fileName =
  document.querySelector("#fileName");

const fileReady =
  document.querySelector("#fileReady");

const changeButton =
  document.querySelector("#changeButton");

const transcribeButton =
  document.querySelector("#transcribeButton");

const showButton =
  document.querySelector("#showButton");

const progressSection =
  document.querySelector("#progressSection");

const progressBar =
  document.querySelector("#progressBar");

const progressValue =
  document.querySelector("#progressValue");

const statusText =
  document.querySelector("#statusText");

const privacyText =
  document.querySelector("#privacyText");

const languageButtons =
  document.querySelectorAll(".language-button");


function text() {
  return translations[currentLanguage];
}


function updateLanguage() {
  const t = text();

  subtitle.textContent =
    t.subtitle;

  dropTitle.textContent =
    t.dropTitle;

  dropDescription.textContent =
    t.dropDescription;

  selectButton.textContent =
    t.selectFile;

  fileReady.textContent =
    t.fileReady;

  changeButton.textContent =
    t.change;

  transcribeButton.textContent =
    t.transcribe;

  showButton.textContent =
    t.show;

  privacyText.textContent =
    t.privacy;


  languageButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.lang === currentLanguage
    );
  });


  updateStatusText();
}


function updateStatusText() {
  if (currentError) {
    statusText.textContent =
      `${text().stages.error}: ${currentError}`;

    return;
  }

  statusText.textContent =
    text().stages[currentStage] ?? "";
}


function setStage(stage) {
  currentStage = stage;
  currentError = null;

  updateStatusText();
}


function setError(error) {
  currentStage = "error";
  currentError = String(error);

  updateStatusText();
}


function setProgress(value) {
  const safeValue =
    Math.max(
      0,
      Math.min(value, 100)
    );

  progressBar.style.width =
    `${safeValue}%`;

  progressValue.textContent =
    `${Math.round(safeValue)}%`;
}


function fileNameFromPath(path) {
  return path
    .split(/[\\/]/)
    .pop();
}


function setSelectedFile(path) {
  if (!path) {
    return;
  }

  selectedPath = path;
  outputPath = null;

  currentStage = "idle";
  currentError = null;

  fileName.textContent =
    fileNameFromPath(path);

  filePanel.classList.remove("hidden");

  transcribeButton.classList.remove("hidden");

  progressSection.classList.add("hidden");

  showButton.classList.add("hidden");

  setProgress(0);
}


languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLanguage =
      button.dataset.lang;

    updateLanguage();
  });
});


async function chooseFile() {
  try {
    const selected =
      await window.__TAURI__.dialog.open({
        multiple: false,
        directory: false,

        filters: [
          {
            name: "Audio & Video",

            extensions: [
              "mp4",
              "mov",
              "m4v",
              "mkv",
              "webm",
              "avi",

              "mp3",
              "wav",
              "m4a",
              "aac",
              "flac",
              "ogg"
            ]
          }
        ]
      });

    if (typeof selected === "string") {
      setSelectedFile(selected);
    }

  } catch (error) {
    console.error(
      "File picker error:",
      error
    );
  }
}


selectButton.addEventListener(
  "click",
  chooseFile
);


changeButton.addEventListener(
  "click",
  chooseFile
);


async function initializeDragAndDrop() {
  try {
    const appWindow =
      window.__TAURI__.webviewWindow
        .getCurrentWebviewWindow();


    await appWindow.onDragDropEvent(
      (event) => {

        if (event.payload.type === "over") {
          dropZone.classList.add(
            "dragging"
          );
        }


        if (event.payload.type === "leave") {
          dropZone.classList.remove(
            "dragging"
          );
        }


        if (event.payload.type === "drop") {
          dropZone.classList.remove(
            "dragging"
          );

          const paths =
            event.payload.paths;

          if (
            paths &&
            paths.length > 0
          ) {
            setSelectedFile(
              paths[0]
            );
          }
        }
      }
    );

  } catch (error) {
    console.error(
      "Drag and drop error:",
      error
    );
  }
}


transcribeButton.addEventListener(
  "click",
  async () => {

    if (!selectedPath) {
      return;
    }


    transcribeButton.disabled =
      true;

    changeButton.disabled =
      true;

    showButton.classList.add(
      "hidden"
    );

    progressSection.classList.remove(
      "hidden"
    );


    setStage("preparing");

    setProgress(5);


    try {
      setStage("extracting");

      setProgress(15);


      const transcribingTimer =
        setTimeout(() => {

          if (
            transcribeButton.disabled
          ) {
            setStage("transcribing");

            setProgress(30);
          }

        }, 1000);


      outputPath =
        await window.__TAURI__.core.invoke(
          "transcribe",
          {
            videoPath:
              selectedPath
          }
        );


      clearTimeout(
        transcribingTimer
      );


      setStage("saving");

      setProgress(95);


      await new Promise(
        (resolve) => {

          setTimeout(
            resolve,
            250
          );

        }
      );


      setStage("done");

      setProgress(100);


      showButton.classList.remove(
        "hidden"
      );

    } catch (error) {

      console.error(
        "Transcription error:",
        error
      );


      setError(error);

      setProgress(0);

    } finally {

      transcribeButton.disabled =
        false;

      changeButton.disabled =
        false;
    }
  }
);


showButton.addEventListener(
  "click",
  async () => {

    if (!outputPath) {
      return;
    }


    try {
      await window.__TAURI__.core.invoke(
        "show_in_folder",
        {
          path:
            outputPath
        }
      );

    } catch (error) {

      console.error(
        "Show in folder error:",
        error
      );
    }
  }
);


updateLanguage();
initializeDragAndDrop();