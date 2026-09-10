use std::{
    env,
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[tauri::command(rename_all = "camelCase")]
async fn transcribe(video_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transcribe_file(&video_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn transcribe_file(video_path: &str) -> Result<String, String> {
    let video = PathBuf::from(video_path);

    if !video.exists() {
        return Err("The selected file does not exist.".to_string());
    }
    let extension = video
    .extension()
    .and_then(|value| value.to_str())
    .map(|value| value.to_ascii_lowercase())
    .ok_or_else(|| "The selected file has no valid extension.".to_string())?;

const ALLOWED_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "m4v", "mkv", "webm", "avi",
    "mp3", "wav", "m4a", "aac", "flac", "ogg",
];

if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
    return Err("Unsupported audio or video format.".to_string());
}

    let parent = video
        .parent()
        .ok_or_else(|| "Could not determine the file directory.".to_string())?;

    let stem = video
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Could not determine the file name.".to_string())?;

    let ffmpeg = find_ffmpeg()?;
    let whisper = find_whisper()?;
    let model = find_model()?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();

    let temporary_audio = env::temp_dir().join(format!(
        "class-transcriber-{timestamp}.wav"
    ));

    let output_base = parent.join(format!("{stem}_Transcription"));
    let output_txt = parent.join(format!("{stem}_Transcription.txt"));

    let ffmpeg_output = Command::new(&ffmpeg)
        .arg("-y")
        .arg("-i")
        .arg(&video)
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg(&temporary_audio)
        .output()
        .map_err(|error| {
            format!("Could not start FFmpeg: {error}")
        })?;

    if !ffmpeg_output.status.success() {
        let _ = fs::remove_file(&temporary_audio);

        return Err(format_process_error(
            "FFmpeg failed",
            &ffmpeg_output.stderr,
        ));
    }

    let whisper_output = Command::new(&whisper)
        .arg("-m")
        .arg(&model)
        .arg("-f")
        .arg(&temporary_audio)
        .arg("-l")
        .arg("auto")
        .arg("-otxt")
        .arg("-of")
        .arg(&output_base)
        .output()
        .map_err(|error| {
            let _ = fs::remove_file(&temporary_audio);

            format!("Could not start whisper.cpp: {error}")
        })?;

    let _ = fs::remove_file(&temporary_audio);

    if !whisper_output.status.success() {
        return Err(format_process_error(
            "whisper.cpp failed",
            &whisper_output.stderr,
        ));
    }

    if !output_txt.exists() {
        return Err(
            "Whisper finished, but the transcript file was not created."
                .to_string(),
        );
    }

    Ok(output_txt.to_string_lossy().into_owned())
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    let file = PathBuf::from(path);

    if !file.exists() {
        return Err("The transcript file does not exist.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&file)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", file.display()))
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        let parent = file
            .parent()
            .ok_or_else(|| "Could not locate the output folder.".to_string())?;

        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn find_ffmpeg() -> Result<PathBuf, String> {
    find_executable(
        "ffmpeg",
        &[
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
        ],
    )
    .ok_or_else(|| {
        "FFmpeg was not found. This development build currently requires FFmpeg to be installed."
            .to_string()
    })
}

fn find_whisper() -> Result<PathBuf, String> {
    find_executable(
        "whisper-cli",
        &[
            "/opt/homebrew/bin/whisper-cli",
            "/usr/local/bin/whisper-cli",
        ],
    )
    .ok_or_else(|| {
        "whisper-cli was not found. This development build currently requires whisper.cpp to be installed."
            .to_string()
    })
}

fn find_executable(
    command: &str,
    known_paths: &[&str],
) -> Option<PathBuf> {
    for path in known_paths {
        let candidate = PathBuf::from(path);

        if candidate.exists() {
            return Some(candidate);
        }
    }

    let path_variable = env::var_os("PATH")?;

    for directory in env::split_paths(&path_variable) {
        let candidate = directory.join(command);

        if candidate.exists() {
            return Some(candidate);
        }

        #[cfg(target_os = "windows")]
        {
            let candidate = directory.join(format!("{command}.exe"));

            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

fn find_model() -> Result<PathBuf, String> {
    let home = home_directory()
        .ok_or_else(|| "Could not determine the home directory.".to_string())?;

    let model = home
        .join("whisper-models")
        .join("ggml-medium.bin");

    if model.exists() {
        Ok(model)
    } else {
        Err("Whisper model was not found. Check the application requirements.".to_string())
    }
}

fn home_directory() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        env::var_os("USERPROFILE").map(PathBuf::from)
    }

    #[cfg(not(target_os = "windows"))]
    {
        env::var_os("HOME").map(PathBuf::from)
    }
}

fn format_process_error(
    title: &str,
    stderr: &[u8],
) -> String {
    let message = String::from_utf8_lossy(stderr);
    let message = message.trim();

    if message.is_empty() {
        title.to_string()
    } else {
        format!("{title}: {message}")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            transcribe,
            show_in_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
