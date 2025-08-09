document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        alarms: [],
        currentRingingAlarm: null,
    };

    // --- DOM ELEMENTS ---
    const overlays = {
        ringing: document.getElementById('ringing-overlay'),
        alarmModal: document.getElementById('alarm-modal'),
    };
    const alarmForm = document.getElementById('alarm-form');
    const alarmList = document.getElementById('alarm-list');
    const addAlarmButton = document.getElementById('add-alarm-button');
    const cancelAlarmButton = document.getElementById('cancel-alarm-button');
    const deleteAlarmButton = document.getElementById('delete-alarm-button');
    const silenceButton = document.getElementById('silence-button');
    const ringingProgress = document.getElementById('ringing-progress');
    const ringingSecondsEl = document.getElementById('ringing-seconds');
    const ringingLabel = document.getElementById('ringing-label');
    const digitalClock = document.getElementById('digital-clock');
    const digitalDate = document.getElementById('digital-date');

    // --- AUDIO CONTEXT for microphone and sound ---
    let audioContext;
    let analyser;
    let microphoneStream;
    let alarmSound;
    const REQUIRED_NOISE_SECONDS = 5;
    let noiseCheckInterval;
    let secondsOfNoise = 0;

    // --- LOCAL STORAGE ---
    function saveAlarmsToStorage() {
        localStorage.setItem('annoyingAlarms', JSON.stringify(state.alarms));
    }

    function loadAlarmsFromStorage() {
        const storedAlarms = localStorage.getItem('annoyingAlarms');
        if (storedAlarms) {
            state.alarms = JSON.parse(storedAlarms);
        }
    }

    // --- UI RENDERING ---
    function renderAlarms() {
        alarmList.innerHTML = '';
        state.alarms.sort((a, b) => new Date(a.time) - new Date(b.time));
        if (state.alarms.length === 0) {
            alarmList.innerHTML = `<p class="col-span-full text-center text-gray-500 mt-8">No alarms set. Add one!</p>`;
            return;
        }
        state.alarms.forEach(alarm => {
            const alarmTime = new Date(alarm.time);
            const card = document.createElement('div');
            card.className = `bg-gray-800 p-6 rounded-lg shadow-md flex justify-between items-center transition-opacity ${alarm.isEnabled ? 'opacity-100' : 'opacity-50'}`;
            card.innerHTML = `
                <div>
                    <p class="text-3xl font-bold">${alarmTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <p class="text-gray-400">${alarm.label}</p>
                    <p class="text-gray-500 text-sm">${alarmTime.toLocaleDateString()}</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" ${alarm.isEnabled ? 'checked' : ''} class="sr-only peer" data-id="${alarm.id}">
                    <div class="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    openAlarmModal(alarm);
                }
            });
            alarmList.appendChild(card);
        });
    }

    // --- CLOCK & ALARM CHECKING ---
    function updateClock() {
        const now = new Date();
        digitalClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        digitalDate.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function checkAlarms() {
        const now = new Date().getTime();
        state.alarms.forEach(alarm => {
            const alarmTime = new Date(alarm.time).getTime();
            if (alarm.isEnabled && now >= alarmTime && !alarm.isTriggered) {
                console.log(`Triggering alarm: ${alarm.label}`);
                alarm.isTriggered = true; // Mark as triggered to avoid re-triggering
                saveAlarmsToStorage();
                triggerAlarm(alarm);
            }
        });
    }

    // --- ALARM MODAL ---
    function openAlarmModal(alarm = null) {
        alarmForm.reset();
        deleteAlarmButton.classList.add('hidden');
        document.getElementById('alarm-id').value = '';

        if (alarm) {
            document.getElementById('modal-title').textContent = 'Edit Alarm';
            document.getElementById('alarm-id').value = alarm.id;
            document.getElementById('alarm-label').value = alarm.label;
            const localTime = new Date(new Date(alarm.time).getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            document.getElementById('alarm-time').value = localTime;
            deleteAlarmButton.classList.remove('hidden');
        } else {
            document.getElementById('modal-title').textContent = 'New Alarm';
        }
        overlays.alarmModal.classList.remove('hidden');
    }

    function closeAlarmModal() {
        overlays.alarmModal.classList.add('hidden');
    }

    function handleAlarmFormSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('alarm-id').value;
        const label = document.getElementById('alarm-label').value;
        const timeValue = document.getElementById('alarm-time').value;

        if (id) { // Editing existing alarm
            const alarmIndex = state.alarms.findIndex(a => a.id === id);
            if (alarmIndex !== -1) {
                state.alarms[alarmIndex].label = label;
                state.alarms[alarmIndex].time = new Date(timeValue).toISOString();
                state.alarms[alarmIndex].isTriggered = false; // Re-arm it
            }
        } else { // Creating new alarm
            const newAlarm = {
                id: `alarm_${new Date().getTime()}`,
                label,
                time: new Date(timeValue).toISOString(),
                isEnabled: true,
                isTriggered: false,
            };
            state.alarms.push(newAlarm);
        }
        saveAlarmsToStorage();
        renderAlarms();
        closeAlarmModal();
    }

    function handleDeleteAlarm() {
        const id = document.getElementById('alarm-id').value;
        if (id && confirm('Are you sure you want to delete this alarm?')) {
            state.alarms = state.alarms.filter(a => a.id !== id);
            saveAlarmsToStorage();
            renderAlarms();
            closeAlarmModal();
        }
    }

    function handleToggleAlarmEnabled(e) {
        if (e.target.type === 'checkbox') {
            const id = e.target.dataset.id;
            const isEnabled = e.target.checked;
            const alarm = state.alarms.find(a => a.id === id);
            if (alarm) {
                alarm.isEnabled = isEnabled;
                if(isEnabled) alarm.isTriggered = false; // Re-arm if enabled
                saveAlarmsToStorage();
                renderAlarms();
            }
        }
    }

    // --- RINGING & MICROPHONE LOGIC ---
    async function startNoiseDetection() {
        try {
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            if (!microphoneStream) {
                microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }

            const source = audioContext.createMediaStreamSource(microphoneStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            secondsOfNoise = 0;

            noiseCheckInterval = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

                const NOISE_THRESHOLD = 30; // Heuristic value, may need tuning
                if (average > NOISE_THRESHOLD) {
                    secondsOfNoise++;
                } else {
                    secondsOfNoise = 0; // Reset if noise stops
                }

                const secondsLeft = Math.max(0, REQUIRED_NOISE_SECONDS - secondsOfNoise);
                ringingSecondsEl.textContent = secondsLeft;
                const progress = secondsOfNoise / REQUIRED_NOISE_SECONDS;
                ringingProgress.style.strokeDashoffset = 283 * (1 - progress);

                if (secondsOfNoise >= REQUIRED_NOISE_SECONDS) {
                    clearInterval(noiseCheckInterval);
                    enableSilenceButton();
                }
            }, 1000);
        } catch (err) {
            alert('Could not access microphone. Please grant permission to silence alarms. Error: ' + err.message);
        }
    }

    function stopNoiseDetection() {
        if (noiseCheckInterval) clearInterval(noiseCheckInterval);
        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }
    }

    function playAlarmSound(soundFile = 'siren.mp3') {
        if (!alarmSound) {
            // NOTE: You must have a 'siren.mp3' file (or other sound) in an 'assets/sounds/' folder
            // relative to your index.html for this to work.
            alarmSound = new Audio(`assets/sounds/${soundFile}`);
            alarmSound.loop = true;
        }
        alarmSound.play().catch(e => console.error("Audio play failed:", e));
    }

    function stopAlarmSound() {
        if (alarmSound) {
            alarmSound.pause();
            alarmSound.currentTime = 0;
        }
    }

    function triggerAlarm(alarmData) {
        if (state.currentRingingAlarm) return; // Don't trigger if one is already ringing

        state.currentRingingAlarm = alarmData;
        ringingLabel.textContent = alarmData.label;
        ringingSecondsEl.textContent = REQUIRED_NOISE_SECONDS;
        ringingProgress.style.strokeDashoffset = 283;
        silenceButton.disabled = true;
        silenceButton.classList.add('cursor-not-allowed', 'bg-gray-500');
        silenceButton.classList.remove('bg-green-600');

        overlays.ringing.classList.remove('hidden');
        playAlarmSound();
        startNoiseDetection();
    }

    function enableSilenceButton() {
        silenceButton.disabled = false;
        silenceButton.classList.remove('cursor-not-allowed', 'bg-gray-500');
        silenceButton.classList.add('bg-green-600', 'hover:bg-green-700');
    }

    function handleSilence() {
        stopAlarmSound();
        stopNoiseDetection();
        overlays.ringing.classList.add('hidden');

        // The alarm is already marked as triggered, we just need to disable it to prevent it from ringing again
        const alarm = state.alarms.find(a => a.id === state.currentRingingAlarm.id);
        if (alarm) {
            alarm.isEnabled = false;
        }
        saveAlarmsToStorage();
        renderAlarms();
        state.currentRingingAlarm = null;
    }

    // --- INITIALIZATION ---
    function init() {
        // First user interaction to enable audio
        const startAudio = () => {
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            document.body.removeEventListener('click', startAudio);
        };
        document.body.addEventListener('click', startAudio);

        loadAlarmsFromStorage();
        renderAlarms();
        updateClock();
        setInterval(updateClock, 1000); // Update clock every second
        setInterval(checkAlarms, 5000); // Check for due alarms every 5 seconds
    }

    // --- EVENT LISTENERS ---
    addAlarmButton.addEventListener('click', () => openAlarmModal());
    cancelAlarmButton.addEventListener('click', closeAlarmModal);
    deleteAlarmButton.addEventListener('click', handleDeleteAlarm);
    alarmForm.addEventListener('submit', handleAlarmFormSubmit);
    alarmList.addEventListener('change', handleToggleAlarmEnabled);
    silenceButton.addEventListener('click', handleSilence);

    // --- KICK IT OFF ---
    init();
});
