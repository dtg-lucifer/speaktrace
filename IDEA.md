---
tags:
  - project
  - idea
status: planning
difficulty: extreme
related:
---
### Goal

Goal is to make a automated software which will take a audio file as input and then identify how many people are talking in that audio file, after doing that it will ask the user to describe the names of the various users talking in the audio file by playing specific parts of the file where that person is talking. After completing the process the software will render out the transcription in this format

```text
Person_1 -> Hey, welcome to this interview
Person_2 -> Hi, thanks for this oppurtunity!
Person_1 -> Shall we begin then?
Person_1 -> Let's hear more about yourself please.
....
```

1. The software should be able to synthesize the understand the number of people talking, the emotions of each, and also add punctuations according to those in the transcription
2. The software also should be able to run a RAG LLM which will be able to answer any question from the user based on the transcription, i.e. "Tell me the ultimate testimony of Person_2 after analyzing the whole conversation"
3. The software should be able to also export the transcription in **VTT** format so that it can be uploaded to any video hosting platform to get captions / subtitles

This project will include:
1. Short term memory (LSTM)
2. RAG
3. LLM
4. Speech Synthesis

---

Users can upload any audio file containing conversation of 1 or more peole, it can be interogation, normal conversation, court hearing and anything else, the system will upload that to a durable storage and then asynchronously perform speech synthesis to first detect how many people in total are talking in that conversation, then ask the user to name every person (system will play 2 - 3 seconds of the conversation where only 1 person is talking and then ask the user to name that person). Then it will start performing actual synthesis, and it will ocnvert the whole conversation in text while retaining names of each person, also it will allow users to download that transcription in any format, suppose for youtube and captions \*.vtt and any other document format, also allowing users to provider their own format in form of a grammers like

```
[$PERSON] -> $SPEECH
***
```

Then also the system will have a llm whcih will be auto trained on that transcription to answer any question from the user's end, such as "What was the outcome of that court hearing?" or "What did the PERSON_1 asked at 2:03 in that conversation ?"

---

```
[Frontend Upload]
        ↓
[Storage Layer]
        ↓
[Audio Processing Pipeline]
   ├── Speaker Diarization
   ├── Speaker Identification (user-assisted)
   ├── Speech-to-Text
   └── Emotion + punctuation
        ↓
[Post-processing Engine]
   ├── Formatting
   ├── Export (VTT, TXT, custom grammar)
        ↓
[LLM + RAG System]
        ↓
[User Query Interface]
```