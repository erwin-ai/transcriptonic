function transcriptObj2Note(result) {
  const lines = []

  result.transcript.forEach(entry => {
      lines.push(`${entry.personName} (${entry.timeStamp})`)
      lines.push(entry.personTranscript)
      // Add an empty line between entries
      lines.push("")
  })
  
  return lines.join("\n").replace(/You \(/g, result.userName + " (")
}

function showToast(message, duration = 1000) {
  const toast = document.getElementById("toast");
  toast.textContent = message; // 메시지 설정
  toast.className = "toast show"; // show 클래스 추가

  // duration 시간 후에 Toast 숨기기
  setTimeout(() => {
      toast.className = "toast"; // show 클래스 제거
  }, duration);
}


window.onload = function () {
  const autoModeRadio = document.querySelector('#auto-mode')
  const manualModeRadio = document.querySelector('#manual-mode')
  const lastMeetingTranscriptLink = document.querySelector("#last-meeting-transcript")
  const lastMeetingSyncLink = document.querySelector("#last-note-sync")

  console.log("Popup loaded")

  chrome.storage.sync.get(["operationMode"], function (result) {
    if (result.operationMode == undefined)
      autoModeRadio.checked = true
    else if (result.operationMode == "auto")
      autoModeRadio.checked = true
    else if (result.operationMode == "manual")
      manualModeRadio.checked = true
  })

  syncLastMeetingNote()

  autoModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () { })
  })
  manualModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () { })
  })
  lastMeetingTranscriptLink.addEventListener("click", () => {
    showToast("Preparing download trancscript", 2000)
    //alert("Preparing download trancscript")
    chrome.storage.local.get(["transcript"], function (result) {
      if (result.transcript)
        chrome.runtime.sendMessage({ type: "download" }, function (response) {
          console.log(response)
        })
      else
        alert("Couldn't find the last meeting's transcript. May be attend one?")
    })
  })

  lastMeetingSyncLink.addEventListener("click", () => {
    console.log("Syncing notes")
    showToast("Syncing notes", 1000)
    chrome.storage.local.get(["transcript"], function (result) {
      if (result.transcript) {
        console.log(result.transcript)
        syncLastMeetingNote()
      } else
        alert("Couldn't find the last meeting's transcript. May be attend one?")
    })
  })

  function syncLastMeetingNote() {
    chrome.storage.local.get(["userName", "transcript", "chatMessages", "meetingTitle", "meetingStartTimeStamp"], function (result) {
      if (result.meetingTitle)
        document.querySelector("#note-title").value = result.meetingTitle
      else
        document.querySelector("#note-title").value = "None"

      if (result.meetingStartTimeStamp)
        document.querySelector("#note-start-at").value = result.meetingStartTimeStamp
      else
        document.querySelector("#note-start-at").value = "None"
      
      if (result.transcript)
        document.querySelector("#note-transcript").textContent = transcriptObj2Note(result)
            
    })
  }
}