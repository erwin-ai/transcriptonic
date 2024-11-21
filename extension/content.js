//*********** GLOBAL VARIABLES **********//
const SELECTOR_USER_NAME = ".awLEm"
const SELECTOR_CAPTION_ROOT = '.a4cQT'
const SELECTOR_CAPTION_ITEMS = '.iOzk7'

const timeFormat = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
}

const timeFormatShort = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
}

const extensionStatusJSON = { 
  "status": 200, 
  "message": "<strong>TranscripTonic is running</strong> <br /> Do not turn off captions" 
}

const extensionStatusJSON_bug = {
  "status": 400,
  "message": "<strong>TranscripTonic encountered a new error</strong>"
}
const reportErrorMessage = "There is a bug in TranscripTonic."
const mutationConfig = { childList: true, attributes: true, subtree: true }

// Name of the person attending the meeting
let userName = "You"
overWriteChromeStorage(["userName"], false)
// Transcript array that holds one or more transcript blocks
// Each transcript block (object) has personName, timeStamp and transcriptText key value pairs
let transcript = []
// Buffer variables to dump values, which get pushed to transcript array as transcript blocks, at defined conditions
let personNameBuffer = "", transcriptTextBuffer = "", timeStampBuffer = undefined
// Buffer variables for deciding when to push a transcript block
let beforePersonName = "", beforeTranscriptText = ""
// Chat messages array that holds one or chat messages of the meeting
// Each message block(object) has personName, timeStamp and messageText key value pairs
let chatMessages = []
overWriteChromeStorage(["chatMessages"], false)

// Capture meeting start timestamp and sanitize special characters with "-" to avoid invalid filenames
let meetingStartTimeStamp = new Date().toLocaleString("default", timeFormat).replace(/[/:]/g, '-').toUpperCase()
let meetingTitle = document.title
overWriteChromeStorage(["meetingStartTimeStamp", "meetingTitle"], false)
// Capture invalid transcript and chat messages DOM element error for the first time
let isTranscriptDomErrorCaptured = false
let isChatMessagesDomErrorCaptured = false
// Capture meeting begin to abort userName capturing interval
let hasMeetingStarted = false
// Capture meeting end to suppress any errors
let hasMeetingEnded = false

console.log("Content script loaded")

async function checkExtensionStatus() {
  console.log("Checking extension status")

  // NON CRITICAL DOM DEPENDENCY. Attempt to get username before meeting starts. 
  // Abort interval if valid username is found or if meeting starts and default to "You".
  captureUserName(SELECTOR_USER_NAME)

  // CRITICAL DOM DEPENDENCY. Wait until the meeting end icon appears, used to detect meeting start
  checkElement(".google-symbols", "call_end").then(() => {
    console.log("Wait until the meeting end icon appears, used to detect meeting start")

    chrome.runtime.sendMessage({ type: "new_meeting_started" }, function (response) {
      console.log(response);
    });
    hasMeetingStarted = true

    try {
      //*********** MEETING START ROUTINES **********//
      // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
      setTimeout(() => updateMeetingTitle(), 5000)

      // **** TRANSCRIPT ROUTINES **** //
      // CRITICAL DOM DEPENDENCY
      const captionsButton = contains(".google-symbols", "closed_caption_off")[0]


      // Click captions icon for non manual operation modes. Async operation.
      chrome.storage.sync.get(["operationMode"], function (result) {
        if (result.operationMode == "manual")
          console.log("Manual mode selected, leaving transcript off")
        else
          captionsButton.click()
      })

      // CRITICAL DOM DEPENDENCY. Grab the transcript element. This element is present, irrespective of captions ON/OFF, so this executes independent of operation mode.
      const transcriptTargetNode = document.querySelector(SELECTOR_CAPTION_ROOT)
      // Attempt to dim down the transcript
      try {
        transcriptTargetNode.firstChild.style.opacity = 0.2
        transcriptTargetNode.childNodes[1].style.opacity = 0.2
      } catch (error) {
        console.error(error)
      }

      // Create transcript observer instance linked to the callback function. Registered irrespective of operation mode, so that any visible transcript can be picked up during the meeting, independent of the operation mode.
      const transcriptObserver = new MutationObserver(transcriber)

      // Start observing the transcript element and chat messages element for configured mutations
      transcriptObserver.observe(transcriptTargetNode, mutationConfig)

      // // **** CHAT MESSAGES ROUTINES **** //
      // const chatMessagesButton = contains(".google-symbols", "chat")[0]
      // // Force open chat messages to make the required DOM to appear. Otherwise, the required chatMessages DOM element is not available.
      // chatMessagesButton.click()
      // let chatMessagesObserver
      // // Allow DOM to be updated and then register chatMessage mutation observer
      // setTimeout(() => {
      //   chatMessagesButton.click()
      //   // CRITICAL DOM DEPENDENCY. Grab the chat messages element. This element is present, irrespective of chat ON/OFF, once it appears for this first time.
      //   try {
      //     const chatMessagesTargetNode = document.querySelectorAll('div[aria-live="polite"]')[0]

      //     // Create chat messages observer instance linked to the callback function. Registered irrespective of operation mode.
      //     chatMessagesObserver = new MutationObserver(chatMessagesRecorder)

      //     chatMessagesObserver.observe(chatMessagesTargetNode, mutationConfig)
      //   } catch (error) {
      //     console.error(error)
      //     showNotification(extensionStatusJSON_bug)
      //   }
      // }, 500)

      // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
      chrome.storage.sync.get(["operationMode"], function (result) {
        if (result.operationMode == "manual")
          showNotification({ status: 400, message: "<strong>Meet Senographer is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
        else
          showNotification(extensionStatusJSON)
      })


      //*********** MEETING END ROUTINES **********//
      // CRITICAL DOM DEPENDENCY. Event listener to capture meeting end button click by user
      contains(".google-symbols", "call_end")[0].parentElement.addEventListener("click", () => {
        // To suppress further errors
        hasMeetingEnded = true
        transcriptObserver.disconnect()
        chatMessagesObserver.disconnect()

        console.log("Meeting ended. Disconnecting observers")

        // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Needed to handle one or more speaking when meeting ends.
        if ((personNameBuffer != "") && (transcriptTextBuffer != ""))
          pushBufferToTranscript()
        // Save to chrome storage and send message to download transcript from background script
        overWriteChromeStorage(["transcript", "chatMessages"], true)
      })
    } catch (error) {
      console.error(error)
      showNotification(extensionStatusJSON_bug)
    }
  })

  function captureUserName(selecttorUserName) {
    console.log("Attempting to capture user name at " + selecttorUserName)

    checkElement(selecttorUserName).then(() => {
      // Poll the element until the textContent loads from network or until meeting starts
      console.log("Poll the element until the textContent loads from network or until meeting starts")

      const captureUserNameInterval = setInterval(() => {
        userName = document.querySelector(selecttorUserName).textContent

        console.log("User name: " + userName)

        if (userName || hasMeetingStarted) {
          clearInterval(captureUserNameInterval)
          // Prevent overwriting default "You" where element is found, but valid userName is not available
          if (userName != "")
            overWriteChromeStorage(["userName"], false)
        }
      }, 100)
    })
  }
}

// Returns all elements of the specified selector type and specified textContent. Return array contains the actual element as well as all the upper parents. 
function contains(selector, text) {
  var elements = document.querySelectorAll(selector);
  return Array.prototype.filter.call(elements, function (element) {
    return RegExp(text).test(element.textContent);
  });
}

// Efficiently waits until the element of the specified selector and textContent appears in the DOM. Polls only on animation frame change
const checkElement = async (selector, text) => {
  if (text) {
    // loops for every animation frame change, until the required element is found
    while (!Array.from(document.querySelectorAll(selector)).find(element => element.textContent === text)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  else {
    // loops for every animation frame change, until the required element is found
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  return document.querySelector(selector);
}

// Shows a responsive notification of specified type and message
function showNotification(extensionStatusJSON) {
  // Banner CSS
  let html = document.querySelector("html");
  let obj = document.createElement("div");
  let logo = document.createElement("img");
  let text = document.createElement("p");

  logo.setAttribute(
    "src",
    "https://yt3.googleusercontent.com/kvOvzIXphJg6Eye3CUDAX1IO-68qoIa0nFwy3bhTI3m-mANujWKhMRBq6Ys6y02QVLpOUoztcA=s900-c-k-c0x00ffffff-no-rj"
  );
  logo.setAttribute("height", "32px");
  logo.setAttribute("width", "32px");
  logo.style.cssText = "border-radius: 4px";

  // Remove banner after 5s
  setTimeout(() => {
    obj.style.display = "none";
  }, 5000);

  if (extensionStatusJSON.status == 200) {
    obj.style.cssText = `color: black; ${commonCSS}`;
    text.innerHTML = extensionStatusJSON.message;
  }
  else {
    obj.style.cssText = `color: orange; ${commonCSS}`;
    text.innerHTML = extensionStatusJSON.message;
  }

  obj.prepend(text);
  obj.prepend(logo);
  if (html)
    html.append(obj);
}

// CSS for notification
const commonCSS = `
    background-color: white;
    backdrop-filter: blur(16px); 
    position: fixed;
    top: 5%; 
    left: 0; 
    right: 0; 
    margin-left: auto; 
    margin-right: auto;
    max-width: 400px;  // Reduced from 780px
    width: 90%;  // Added to ensure it's not too wide on larger screens
    z-index: 1000; 
    padding: 0rem 1rem;
    border-radius: 8px; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    gap: 16px;  
    font-size: 0.9rem; 
    line-height: 1.5; 
    font-family: 'Google Sans',Roboto,Arial,sans-serif; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`;


// Callback function to execute when transcription mutations are observed. 
function transcriber(mutationsList, observer) {
  // Delay for 1000ms to allow for text corrections by Meet.
  mutationsList.forEach(mutation => {
    try {
      // Begin parsing transcript
      if (document.querySelector(SELECTOR_CAPTION_ROOT)?.querySelector(SELECTOR_CAPTION_ITEMS)?.childNodes.length > 0) {
        // CRITICAL DOM DEPENDENCY. Get all people in the transcript
        // SELECTOR_CAPTION_ITEMS
        const people = document.querySelector(SELECTOR_CAPTION_ROOT).querySelector(SELECTOR_CAPTION_ITEMS).childNodes

        // Get the last person
        const person = people[people.length - 1]
        // CRITICAL DOM DEPENDENCY
        const currentPersonName = person.childNodes[0].textContent
        // CRITICAL DOM DEPENDENCY
        const currentTranscriptText = person.childNodes[1].lastChild.textContent

        console.log(" >>> " + currentPersonName + " : " + currentTranscriptText)
        // Starting fresh in a meeting or resume from no active transcript
        if (beforeTranscriptText == "") {
          console.log("Starting fresh in a meeting or resume from no active transcript")

          personNameBuffer = currentPersonName
          timeStampBuffer = new Date().toLocaleString("default", timeFormat).toUpperCase()
          beforeTranscriptText = currentTranscriptText
          transcriptTextBuffer = currentTranscriptText
        }
        // Some prior transcript buffer exists
        else {
          // New person started speaking 
          if (personNameBuffer != currentPersonName) {
            // Push previous person's transcript as a block
            pushBufferToTranscript()
            console.log("Writing transcript block")
            overWriteChromeStorage(["transcript"], false)
            // Update buffers for next mutation and store transcript block timeStamp
            beforeTranscriptText = currentTranscriptText
            personNameBuffer = currentPersonName
            timeStampBuffer = new Date().toLocaleString("default", timeFormatShort).toUpperCase()
            transcriptTextBuffer = currentTranscriptText
          }
          // Same person speaking more
          else {
            transcriptTextBuffer = currentTranscriptText
            // Update buffers for next mutation
            beforeTranscriptText = currentTranscriptText
            // If a person is speaking for a long time, Google Meet does not keep the entire text in the spans. Starting parts are automatically removed in an unpredictable way as the length increases and extension will miss them. So we force remove a lengthy transcript node in a controlled way. Google Meet will add a fresh person node when we remove it and continue transcription. picks it up as a new person and nothing is missed.
            if (currentTranscriptText.length > 250){
              console.log("Removing lengthy transcript node")
              person.remove()
            }
          }
        }
      }
      // No people found in transcript DOM
      else {
        // No transcript yet or the last person stopped speaking(and no one has started speaking next)
        console.log("No active transcript")
        // Push data in the buffer variables to the transcript array, but avoid pushing blank ones.
        if ((personNameBuffer != "") && (transcriptTextBuffer != "")) {
          pushBufferToTranscript()
          console.log("Writing transcript block from no active transcript")
          overWriteChromeStorage(["transcript"], false)
        }
        // Update buffers for the next person in the next mutation
        beforePersonName = ""
        beforeTranscriptText = ""
        personNameBuffer = ""
        transcriptTextBuffer = ""
      }
      // console.log(transcriptTextBuffer)
      // console.log(transcript)
    } catch (error) {
      console.error(error)
      if (isTranscriptDomErrorCaptured == false && hasMeetingEnded == false) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)
      }
      isTranscriptDomErrorCaptured = true
    }
  })
}

// Callback function to execute when chat messages mutations are observed. 
function chatMessagesRecorder(mutationsList, observer) {
  mutationsList.forEach(mutation => {
    try {
      // CRITICAL DOM DEPENDENCY. Get all people in the transcript
      const chatMessagesElement = document.querySelectorAll('div[aria-live="polite"]')[0]
      // Attempt to parse messages only if at least one message exists
      if (chatMessagesElement.children.length > 0) {
        // CRITICAL DOM DEPENDENCY. Get the last message that was sent/received.
        const chatMessageElement = chatMessagesElement.lastChild
        // CRITICAL DOM DEPENDENCY.
        const personName = chatMessageElement.firstChild.firstChild.textContent
        const timeStamp = new Date().toLocaleString("default", timeFormatShort).toUpperCase()
        // CRITICAL DOM DEPENDENCY. Some mutations will have some noisy text at the end, which is handled in pushUnique function.
        const chatMessageText = chatMessageElement.lastChild.lastChild.textContent

        const chatMessageBlock = {
          personName: personName,
          timeStamp: timeStamp,
          chatMessageText: chatMessageText
        }

        // Lot of mutations fire for each message, pick them only once
        pushUnique(chatMessageBlock)
        overWriteChromeStorage(["chatMessages", false])
        console.log(chatMessages)
      }
    }
    catch (error) {
      console.error(error)
      if (isChatMessagesDomErrorCaptured == false && hasMeetingEnded == false) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)
      }
      isChatMessagesDomErrorCaptured = true
    }
  })
}

// Pushes data in the buffer to transcript array as a transcript block
function pushBufferToTranscript() {
  transcript.push({
    "personName": personNameBuffer,
    "timeStamp": timeStampBuffer,
    "personTranscript": transcriptTextBuffer
  })
}

// Pushes object to array only if it doesn't already exist. chatMessage is checked for substring since some trailing text(keep Pin message) is present from a button that allows to pin the message.
function pushUnique(chatBlock) {
  const isExisting = chatMessages.some(item =>
    item.personName == chatBlock.personName &&
    item.timeStamp == chatBlock.timeStamp &&
    chatBlock.chatMessageText.includes(item.chatMessageText)
  )
  if (!isExisting)
    chatMessages.push(chatBlock);
}

// Saves specified variables to chrome storage. Optionally, can send message to background script to download, post saving.
function overWriteChromeStorage(keys, sendDownloadMessage) {
  const objectToSave = {}
  // Hard coded list of keys that are accepted
  if (keys.includes("userName"))
    objectToSave.userName = userName
  if (keys.includes("transcript"))
    objectToSave.transcript = transcript
  if (keys.includes("meetingTitle"))
    objectToSave.meetingTitle = meetingTitle
  if (keys.includes("meetingStartTimeStamp"))
    objectToSave.meetingStartTimeStamp = meetingStartTimeStamp
  if (keys.includes("chatMessages"))
    objectToSave.chatMessages = chatMessages

  chrome.storage.local.set(objectToSave, function () {
    if (sendDownloadMessage) {
      // Download only if any transcript is present, irrespective of chat messages
      if (transcript.length > 0) {
        chrome.runtime.sendMessage({ type: "download" }, function (response) {
          console.log(response);
        })
      }
    }
  })
}

// Grabs updated meeting title, if available. Replaces special characters with underscore to avoid invalid file names.
function updateMeetingTitle() {
  try {
    // NON CRITICAL DOM DEPENDENCY
    const title = document.querySelector(".u6vdEc").textContent
    const invalidFilenameRegex = /[^\w\-_.() ]/g
    meetingTitle = title.replace(invalidFilenameRegex, '_')
    overWriteChromeStorage(["meetingTitle"], false)
    return meetingTitle
  } catch (error) {
    console.error(error)
    overWriteChromeStorage(["meetingTitle"], false)
    return meetingTitle
  }
}


checkExtensionStatus()

setInterval(() => {
  if (transcript.length > 0) {
    overWriteChromeStorage(["transcript"], false);
  }
}, 5000);

// 2024-11-20 11:00:00
{/* 
<div class="a4cQT kV7vwc eO2Zfd" jscontroller="D1tHje" jsaction="bz0DVc:HWTqGc;TpIHXe:lUFH9b;E18dRb:lUFH9b;QBUr8:lUFH9b;v2nhid:YHhXNc;stc2ve:oh3Xke" style="">
  <div class="ooO90d  P9KVBf jxX42 " jscontroller="cZ0noe" jsaction="rcuQ6b:KbbOyc;F41Sec:KbbOyc;OoZzdf:hDhshf;UTb4bb:GUAMQb" style="opacity: 0.2;">
    <div jscontroller="TkvK2e" jsaction="JIbuQc:LDHNBf(gnzhTe)">
      <span data-is-tooltip-wrapper="true">
        <div class="VfPpkd-dgl2Hf-ppHlrf-sM5MNb" data-is-touch-wrapper="true">
          <button class="VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-Bz112c-M1Soyc VfPpkd-LgbsSe-OWXEXe-dgl2Hf ksBjEc lKxP2d LQeN7 M6Iwrf" jscontroller="soHxf" jsaction="click:cOuCgd; mousedown:UX7yZ; mouseup:lbsD7e; mouseenter:tfO1Yc; mouseleave:JywGue; touchstart:p6p2H; touchmove:FwuNnf; touchend:yfqBxc; touchcancel:JMtRjd; focus:AHmuwe; blur:O22p3e; contextmenu:mg9Pef;mlnRJb:fLiPzd" data-idom-class="ksBjEc lKxP2d LQeN7 M6Iwrf" jsname="gnzhTe" aria-label="Korean Captions settings" data-tooltip-enabled="true" aria-describedby="tt-c1116">
            <div class="VfPpkd-Jh9lGc"></div>
            <div class="VfPpkd-J1Ukfc-LhBDec"></div>
            <div class="VfPpkd-RLmnJb"></div>
            <i class="google-material-icons notranslate VfPpkd-kBDsod" aria-hidden="true">settings</i><span jsname="V67aGc" class="VfPpkd-vQzf8d">Korean</span>
          </button>
        </div>
        <div class="EY8ABd-OWXEXe-TAWMXe" role="tooltip" aria-hidden="true" id="tt-c1116">Captions settings</div>
      </span>
    </div>
  </div>
  <div>
    <div jsname="dsyhDe" class="iOzk7 XDPoIe " style=""></div>
    <div jsname="APQunf" class="iOzk7 XDPoIe" style="display: none;"></div>
  </div>
  <div jscontroller="mdnBv" jsaction="stc2ve:MO88xb;QBUr8:KNou4c"></div>
</div>
  
  
  
  <div jsname="dsyhDe" class="iOzk7 XDPoIe " style="">
   <div class="nMcdL bj4p3b" style="">
      <div class="adE6rb M6cG9d">
         <img alt="" class="Z6byG r6DyN" src="https://lh3.googleusercontent.com/a/ACg8ocL1OblT8Ejetq2MN-vMIgT7CxXzQ9s9p_fLJJqJBl9c_OmIno0=s80-p-k-no-mo" data-iml="236298.60000038147">
         <div class="KcIKyf jxFHg">Jun Hong</div>
      </div>
      <div jsname="YSxPC" class="bYevke wY1pdd" style="height: 117px;">
         <div jsname="tgaKEf" class="bh44bd VbkSUe" style="text-indent: 450.859px;">
          <span>발생한 건지 cdp에서 발생한 </span><span>건지 요거를 좀 체크를 </span><span>했어야 되는데. </span><span>제가 이거는 허리 </span><span>돌아가면은 추가로 또 공유 </span><span>드려 볼게요. 여기서 좀 </span><span>풀로를 발견하면. </span><span>그때 리텐션은 앱 전체 </span><span>리텐션이 한 51%로 요것도 </span><span>우상. </span>
         </div>
      </div>
   </div>
  </div>
*/}

// CURRENT GOOGLE MEET TRANSCRIPT DOM

{/* 
<div class="a4cQT" jsaction="bz0DVc:HWTqGc;TpIHXe:c0270d;v2nhid:YHhXNc;kDAVge:lUFH9b;QBUr8:lUFH9b;stc2ve:oh3Xke" jscontroller="D1tHje" style="right: 16px; left: 16px; bottom: 80px;">
  <div>
    <div class="iOzk7" jsname="dsyhDe" style="">
      //PERSON 1
      <div class="TBMuR bj4p3b" style="">
        <div>
          <img alt="" class="KpxDtd r6DyN" src="https://lh3.googleusercontent.com/a/some-url" data-iml="453">
          <div class="zs7s8d jxFHg">Person 1</div>
        </div>
        <div jsname="YSxPC" class="Mz6pEf wY1pdd" style="height: 28.4444px;">
          <div jsname="tgaKEf" class="iTTPOb VbkSUe">
          <span>Some transcript text.</span>
          <span>Some more text.</span></div>
        </div>
      </div>
      
      // PERSON 2
      <div class="TBMuR bj4p3b" style="">
        <div><img alt="" class="KpxDtd r6DyN" src="https://lh3.googleusercontent.com/a/some-url" data-iml="453">
          <div class="zs7s8d jxFHg">Person 2</div>
        </div>
        <div jsname="YSxPC" class="Mz6pEf wY1pdd" style="height: 28.4444px;">
          <div jsname="tgaKEf" class="iTTPOb VbkSUe">
          <span>Some transcript text.</span>
          <span>Some more text.</span></div>
        </div>
      </div>
    </div>
    <div class="iOzk7" jsname="APQunf" style="display: none;"></div>
  </div>
  <More divs />
</div> */}

// CURRENT GOOGLE MEET CHAT MESSAGES DOM
{/* <div jsname="xySENc" aria-live="polite" jscontroller="Mzzivb" jsaction="nulN2d:XL2g4b;vrPT5c:XL2g4b;k9UrDc:ClCcUe"
  class="Ge9Kpc z38b6">
  <div class="Ss4fHf" jsname="Ypafjf" tabindex="-1" jscontroller="LQRnv"
    jsaction="JIbuQc:sCzVOd(aUCive),T4Iwcd(g21v4c),yyLnsd(iJEnyb),yFT8A(RNMM1e),Cg1Rgf(EZbOH)" style="order: 0;">
    <div class="QTyiie">
      <div class="poVWob">You</div>
      <div jsname="biJjHb" class="MuzmKe">17:00</div>
    </div>
    <div class="beTDc">
      <div class="er6Kjc chmVPb">
        <div class="ptNLrf">
          <div jsname="dTKtvb">
            <div jscontroller="RrV5Ic" jsaction="rcuQ6b:XZyPzc" data-is-tv="false">Hello</div>
          </div>
          <div class="pZBsfc">Hover over a message to pin it<i class="google-material-icons VfPpkd-kBDsod WRc1Nb"
              aria-hidden="true">keep</i></div>
          <div class="MMfG3b"><span tooltip-id="ucc-17"></span><span data-is-tooltip-wrapper="true"><button
                class="VfPpkd-Bz112c-LgbsSe yHy1rc eT1oJ tWDL4c Brnbv pFZkBd" jscontroller="soHxf"
                jsaction="click:cOuCgd; mousedown:UX7yZ; mouseup:lbsD7e; mouseenter:tfO1Yc; mouseleave:JywGue; touchstart:p6p2H; touchmove:FwuNnf; touchend:yfqBxc; touchcancel:JMtRjd; focus:AHmuwe; blur:O22p3e; contextmenu:mg9Pef;mlnRJb:fLiPzd"
                jsname="iJEnyb" data-disable-idom="true" aria-label="Pin message" data-tooltip-enabled="true"
                data-tooltip-id="ucc-17" data-tooltip-x-position="3" data-tooltip-y-position="2" role="button"
                data-message-id="1714476309237">
                <div jsname="s3Eaab" class="VfPpkd-Bz112c-Jh9lGc"></div>
                <div class="VfPpkd-Bz112c-J1Ukfc-LhBDec"></div><i class="google-material-icons VfPpkd-kBDsod VjEpdd"
                  aria-hidden="true">keep</i>
              </button>
              <div class="EY8ABd-OWXEXe-TAWMXe" role="tooltip" aria-hidden="true" id="ucc-17">Pin message</div>
            </span></div>
        </div>
      </div>
    </div>
  </div>
</div> */}