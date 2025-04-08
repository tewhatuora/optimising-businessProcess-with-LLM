import React, { useState, useRef } from 'react';
import { Paperclip, Send, RefreshCw } from 'lucide-react';
import { AzureOpenAI } from 'openai';
import mammoth from 'mammoth';

interface AssistantOption {
  id: string;
  name: string;
  description: string;
}

const assistantOptions: AssistantOption[] = [
  {
    id: "asst_nXkuFUI47tFH0EsheqGDgLCQ",
    name: "Media Logs",
    description: "Drafting a first response to the media questions from the media logs"
  },
  {
    id: "asst_QIkAnnTvWihDgbD4o6UrluWm",
    name: "Meeting Minutes Taking",
    description: "Summarise meeting minutes from a file or text input"
  },
  {
    id: "asst_xxx789",
    name: "TEST-2-DON'T USE",
    description: "Placeholder for other usecase"
  }
];

function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState(assistantOptions[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const client = new AzureOpenAI({
    endpoint: "https://dev-tuhi-clinicalnotesynthesis.openai.azure.com",
    apiVersion: "2024-05-01-preview",
    apiKey: "149096a4341942e186e76793d516c568",
    dangerouslyAllowBrowser: true
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
  
    setFile(selectedFile);
  
    const reader = new FileReader();
  
    if (selectedFile.name.endsWith(".docx")) {
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          setInput((prevInput) => `${prevInput}\n\n${result.value}`);
        } catch (error) {
          console.error("Error extracting text from .docx:", error);
          setInput((prevInput) => `${prevInput}\n\n[Could not extract text from file]`);
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } else if (selectedFile.type.startsWith("text/")) {
      reader.onload = (e) => {
        const fileContent = e.target?.result as string;
        setInput((prevInput) => `${prevInput}\n\n${fileContent}`);
      };
      reader.readAsText(selectedFile);
    } else {
      reader.onload = (e) => {
        const base64String = e.target?.result as string;
        setInput((prevInput) => `${prevInput}\n\n[File Uploaded: ${selectedFile.name}, Base64: ${base64String.substring(0, 100)}...]`);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleProcess = async () => {
    setIsLoading(true);
    setResult('Processing...');
    try {
      const assistantThread = await client.beta.threads.create({});
      const threadId = assistantThread.id;  

      await client.beta.threads.messages.create(
        threadId,
        {
          role: "user",
          content: input,
        }
      );

      const runResponse = await client.beta.threads.runs.create(threadId, {
        assistant_id: selectedAssistant.id,
      });

      let runStatus = runResponse.status;
      let runId = runResponse.id;

      while (runStatus === 'queued' || runStatus === 'in_progress') {
        await new Promise(resolve => setTimeout(resolve, 8000));
        const runStatusResponse = await client.beta.threads.runs.retrieve(
          threadId,
          runId
        );
        runStatus = runStatusResponse.status;
      }

      if (runStatus === 'completed') {
        const messages = await client.beta.threads.messages.list(threadId);
        const assistantMessage = messages.data.find(
          msg => msg.role === "assistant" && msg.content && msg.content.length > 0
        );

        if (assistantMessage) {
          const content = assistantMessage.content[0];
          const responseText = content?.text?.value || "No response content";
          const cleanedText = responseText.replace(/【\d+:\d+†source】/g,'');
          
          // console.log("Full Assistant Message Content:", JSON.stringify(content, null, 2));
          
          const annotations = content?.text?.annotations || [];
          const fileIds = annotations
            .filter(ann => ann.file_citation)
            .map(ann => ann.file_citation.file_id);
      
          const uniqueFileIds = [...new Set(fileIds)];
          const fileNames: string[] = [];

          for (const fileId of uniqueFileIds) {
            try {
              const fileInfo = await client.files.retrieve(fileId);
              fileNames.push(fileInfo.filename);
            } catch (err) {
              console.warn(`Could not retrieve file info for ID ${fileId}`, err);
            }
          }
          
          const sourceText = fileNames.length > 0
            ? `\n\nSources:\n- ${fileNames.join('\n- ')}`
            : '';
      
          setResult(cleanedText + sourceText);
        } else {
          setResult("No response content available");
        }
      } else {
        setResult(`Run ended with status: ${runStatus}`);
      }
    } catch (error) {
      console.error("Error during process:", error);
      setResult(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setInput('');
    setResult('');
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold text-gray-900 mb-8">
          {selectedAssistant.description}
        </h1>
        
        <div className="mb-6">
          <label htmlFor="assistant-select" className="block text-sm font-medium text-gray-700 mb-2">
            Select Your Usecase
          </label>
          <select
            id="assistant-select"
            value={selectedAssistant.id}
            onChange={(e) => setSelectedAssistant(assistantOptions.find(opt => opt.id === e.target.value) || assistantOptions[0])}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {assistantOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h2 className="text-xl font-medium text-gray-900">Input</h2>
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste text here"
                className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <div className="absolute bottom-4 left-4">
                <input 
                  type="file"
                  accept=".txt,.doc,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  ref={fileInputRef}
                />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center text-gray-600 hover:text-gray-900 cursor-pointer">
                  <Paperclip className="w-5 h-5 mr-2" />
                  <span>{file ? file.name : "Attach a file"}</span>
                </label>
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleProcess}
                disabled={isLoading || !input}
                className={`px-6 py-2 bg-[#1B4D5C] text-white rounded hover:bg-[#153e4a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1B4D5C] ${
                  (isLoading || !input) && 'opacity-50 cursor-not-allowed'
                }`}
              >
                {isLoading ? 'Processing...' : 'Process'}
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-2 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-medium text-gray-900">Result</h2>
            <div className="bg-white p-4 border border-gray-300 rounded-lg h-96 overflow-auto">
              {result ? (
                <div className="prose max-w-none whitespace-pre-wrap">
                  {result}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">
                  Results will appear here
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;