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
    id: "asst_yH75KL07chJztcQJ2FvAnD4A",
    name: "DEMO",
    description: "Discover What AI Can Do for You"
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
      console.log("Assistant content object:", content);
    
      const responseText = content?.text?.value || "No response content";
      const annotations = content?.text?.annotations || [];
    
      // Map file_id to filename
      const fileIdToNameMap: Record<string, string> = {};
    
      // Collect unique file_ids
      const uniqueFileIds = [
        ...new Set(annotations.map(ann => ann.file_citation?.file_id).filter(Boolean)),
      ];

      const fileNames: string[] = [];
    
      // Fetch filenames and populate map
      for (const fileId of uniqueFileIds) {
        try {
          const fileInfo = await client.files.retrieve(fileId);
          fileIdToNameMap[fileId] = fileInfo.filename;
          fileNames.push(fileInfo.filename);
        } catch (err) {
          console.warn(`Could not retrieve file info for ID ${fileId}`, err);
          fileIdToNameMap[fileId] = "Unknown File";
          fileNames.push("Unknown File");
        }
      }
    
      // Replace numbered source markers with filenames
      let finalText = responseText;
      for (const annotation of annotations) {
        if (annotation.type === 'file_citation') {
          const marker = annotation.text; // e.g., " "
          const fileId = annotation.file_citation?.file_id;
          const fileName = fileIdToNameMap[fileId] || 'Unknown File';
    
          finalText = finalText.replace(marker, `(${fileName})`);
        }
      }

      const sourceText = fileNames.length >0 ? `\n\nSources:\n- ${fileNames.join('\n- ')}`
        : '';
      
        setResult(finalText + sourceText);
        
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
    <div className="min-h-screen bg-gray-100 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-[#1B4D5C] text-white rounded-xl shadow-lg p-6">
          {/* <h1 className="text-3xl font-bold mb-2">AI Assistant</h1> */}
          <p className="text-lg opacity-90">{selectedAssistant.description}</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6">
          <label htmlFor="assistant-select" className="block text-lg font-semibold text-gray-900 mb-2">
            Select Your Use Case
          </label>
          <select
            id="assistant-select"
            value={selectedAssistant.id}
            onChange={(e) => setSelectedAssistant(assistantOptions.find(opt => opt.id === e.target.value) || assistantOptions[0])}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B4D5C] focus:border-transparent text-gray-700 bg-gray-50 transition duration-150"
          >
            {assistantOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">Input</h2>
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter your text here..."
                className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1B4D5C] focus:border-transparent resize-none bg-gray-50"
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
                  className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition duration-150 cursor-pointer">
                  <Paperclip className="w-5 h-5 mr-2" />
                  <span>{file ? file.name : "Attach a file"}</span>
                </label>
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleProcess}
                disabled={isLoading || !input}
                className={`flex-1 px-6 py-3 bg-[#1B4D5C] text-white rounded-lg hover:bg-[#153e4a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1B4D5C] transition duration-150 ${
                  (isLoading || !input) && 'opacity-50 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center justify-center">
                    <Send className="w-5 h-5 mr-2" />
                    Process
                  </span>
                )}
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <h2 className="text-2xl font-semibold text-gray-900">Result</h2>
            <div className="bg-gray-50 p-6 border border-gray-200 rounded-lg h-96 overflow-auto">
              {result ? (
                <div className="prose max-w-none whitespace-pre-wrap text-gray-700">
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

        <div className="bg-[#3C8795] text-white rounded-xl shadow-lg p-6">
          <p className="text-sm leading-relaxed">
            Try out our AI Assistant, powered by Azure OpenAI, to explore how generative AI can support your work. Test ideas, ask questions, and discover potential use cases in a safe sandbox environment. If you find it useful, we can explore how to tailor it for your team's needs.
            <br/><br/>
            To share ideas or feedback, contact us at <a href="mailto:innovation@tewhatuora.govt.nz" className="underline">innovation@tewhatuora.govt.nz.</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
