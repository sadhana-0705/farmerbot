import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { Send, Mic, MicOff, Globe, User, Bot, Loader2 } from 'lucide-react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Generate unique session ID
const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const KisanVani = () => {
  const [currentLanguage, setCurrentLanguage] = useState('english');
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [faqData, setFaqData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(generateSessionId());
  const chatEndRef = useRef(null);
  
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // Load FAQ data when language changes
  useEffect(() => {
    loadFAQ();
    loadChatHistory();
  }, [currentLanguage]);

  // Handle speech recognition
  useEffect(() => {
    if (transcript) {
      setMessage(transcript);
    }
  }, [transcript]);

  // Initialize voices when component mounts
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Load voices
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
      };
      
      // Load voices immediately if available
      loadVoices();
      
      // Load voices when they become available
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Improved language switching with voice feedback
  const switchLanguage = (lang) => {
    setCurrentLanguage(lang);
    SpeechRecognition.stopListening();
    resetTranscript();
    
    const successMessage = lang === 'malayalam' 
      ? 'മലയാളത്തിലേക്ക് മാറ്റി' 
      : 'Language switched to English';
    toast.success(successMessage);
    
    // Voice feedback for language switch
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(successMessage);
      utterance.lang = lang === 'malayalam' ? 'ml-IN' : 'en-US';
      utterance.rate = 0.8;
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 500);
    }
  };

  const loadFAQ = async () => {
    try {
      const response = await axios.get(`${API}/faq/${currentLanguage}`);
      setFaqData(response.data);
    } catch (error) {
      console.error('Error loading FAQ:', error);
      toast.error('Failed to load FAQ data');
    }
  };

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${API}/chat-history/${sessionId}`);
      setChatHistory(response.data);
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const sendMessage = async (messageText = message) => {
    if (!messageText.trim()) return;

    setIsLoading(true);
    const userMessage = messageText.trim();
    
    // Auto-detect language based on message content
    const containsMalayalam = /[\u0D00-\u0D7F]/.test(userMessage);
    const detectedLanguage = containsMalayalam ? 'malayalam' : currentLanguage;
    
    // Add user message to chat immediately
    const tempUserMsg = {
      id: `temp_${Date.now()}`,
      message: userMessage,
      response: null,
      timestamp: new Date(),
      isUser: true
    };
    
    setChatHistory(prev => [...prev, tempUserMsg]);
    setMessage('');
    resetTranscript();

    try {
      const response = await axios.post(`${API}/chat`, {
        message: userMessage,
        session_id: sessionId,
        language: detectedLanguage
      });

      // Add AI response to chat
      const aiMessage = {
        id: response.data.id,
        message: userMessage,
        response: response.data.response,
        timestamp: response.data.timestamp,
        isUser: false,
        language: detectedLanguage
      };

      setChatHistory(prev => [...prev.filter(msg => msg.id !== tempUserMsg.id), aiMessage]);
      
      // Enhanced Text-to-speech for AI response with better Malayalam support
      if ('speechSynthesis' in window) {
        // Stop any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(response.data.response);
        
        // Configure voice settings based on detected language
        if (detectedLanguage === 'malayalam') {
          // Enhanced Malayalam voice configuration
          utterance.rate = 0.6; // Slower for Malayalam comprehension
          utterance.pitch = 1.1; // Slightly higher pitch for Malayalam
          utterance.volume = 0.9;
          
          // Try multiple fallback options for Malayalam voice
          window.speechSynthesis.onvoiceschanged = () => {
            const voices = window.speechSynthesis.getVoices();
            console.log('Available voices for Malayalam:', voices.map(v => `${v.name} (${v.lang})`));
            
            // Priority order for Malayalam voice selection
            const malayalamVoice = voices.find(voice => 
              voice.lang === 'ml-IN' || voice.lang === 'ml'
            ) || voices.find(voice => 
              voice.lang === 'hi-IN' || voice.lang === 'hi'
            ) || voices.find(voice => 
              voice.name.toLowerCase().includes('malayalam')
            ) || voices.find(voice => 
              voice.name.toLowerCase().includes('hindi')
            ) || voices.find(voice => 
              voice.lang.startsWith('ta') // Tamil as closer alternative
            );
            
            if (malayalamVoice) {
              utterance.voice = malayalamVoice;
              utterance.lang = malayalamVoice.lang;
              console.log('Selected voice for Malayalam:', malayalamVoice.name, malayalamVoice.lang);
            } else {
              // Fallback to Hindi or default voice
              utterance.lang = 'hi-IN';
              console.log('No Malayalam voice found, using Hindi fallback');
            }
          };
          
          // Trigger voice loading if not already loaded
          if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.getVoices();
          } else {
            // Voices already loaded, select immediately
            const voices = window.speechSynthesis.getVoices();
            const malayalamVoice = voices.find(voice => 
              voice.lang === 'ml-IN' || voice.lang === 'ml'
            ) || voices.find(voice => 
              voice.lang === 'hi-IN' || voice.lang === 'hi'
            );
            
            if (malayalamVoice) {
              utterance.voice = malayalamVoice;
              utterance.lang = malayalamVoice.lang;
            } else {
              utterance.lang = 'hi-IN';
            }
          }
        } else {
          // English voice configuration
          utterance.lang = 'en-US';
          utterance.rate = 0.8;
          utterance.pitch = 1.0;
          utterance.volume = 0.9;
          
          // Try to find English voice
          const voices = window.speechSynthesis.getVoices();
          const englishVoice = voices.find(voice => 
            voice.lang.includes('en-US') || voice.lang.includes('en')
          );
          if (englishVoice) {
            utterance.voice = englishVoice;
          }
        }
        
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event);
          const errorMsg = detectedLanguage === 'malayalam' 
            ? 'ശബ്ദം പ്ലേ ചെയ്യാൻ കഴിഞ്ഞില്ല' 
            : 'Could not play audio';
          toast.error(errorMsg);
        };
        
        utterance.onend = () => {
          console.log('Speech synthesis completed');
        };
        
        // Add delay to ensure voice is properly loaded
        setTimeout(() => {
          try {
            window.speechSynthesis.speak(utterance);
            console.log('Started speech synthesis');
          } catch (error) {
            console.error('Failed to start speech synthesis:', error);
          }
        }, 200);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = currentLanguage === 'malayalam' 
        ? 'സന്ദേശം അയയ്ക്കാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.'
        : 'Failed to send message. Please try again.';
      toast.error(errorMessage);
      setChatHistory(prev => prev.filter(msg => msg.id !== tempUserMsg.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFAQClick = (faqItem) => {
    sendMessage(faqItem.question);
  };

  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      const stopMessage = currentLanguage === 'malayalam' 
        ? 'ശ്രവണം നിർത്തി' 
        : 'Stopped listening';
      toast.info(stopMessage);
    } else {
      // Enhanced speech recognition with better Malayalam support
      const speechConfig = {
        continuous: true,
        interimResults: true,
        language: currentLanguage === 'malayalam' ? 'ml-IN' : 'en-US'
      };
      
      // Enhanced Malayalam speech recognition
      if (currentLanguage === 'malayalam') {
        speechConfig.language = 'ml-IN';
        // Add additional configuration for Malayalam
        speechConfig.maxAlternatives = 3;
      }
      
      try {
        SpeechRecognition.startListening(speechConfig);
        
        // Show toast for better user feedback
        const listeningMessage = currentLanguage === 'malayalam' 
          ? 'ശ്രവിക്കുന്നു... മലയാളത്തിൽ സംസാരിക്കുക'
          : 'Listening... Please speak in English';
        toast.success(listeningMessage);
      } catch (error) {
        console.error('Speech recognition error:', error);
        const errorMessage = currentLanguage === 'malayalam'
          ? 'ശബ്ദം തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല'
          : 'Voice recognition failed';
        toast.error(errorMessage);
      }
    }
  };

  const content = {
    english: {
      title: "Kisan Vani",
      subtitle: "AI Chatbot for Farmers",
      placeholder: "Ask me about farming, crops, government schemes...",
      faqTitle: "Frequently Asked Questions",
      powered: "Powered by Emergent",
      send: "Send",
      listening: "Listening...",
      noMic: "Microphone not supported"
    },
    malayalam: {
      title: "കിസാൻ വാണി",
      subtitle: "കർഷകർക്കുള്ള AI ചാറ്റ്ബോട്ട്",
      placeholder: "കൃഷി, വിളകൾ, സർക്കാർ പദ്ധതികൾ എന്നിവയെക്കുറിച്ച് ചോദിക്കുക...",
      faqTitle: "പതിവായി ചോദിക്കുന്ന questions",
      powered: "Emergent നൽകുന്നത്",
      send: "അയയ്ക്കുക",
      listening: "കേൾക്കുന്നു...",
      noMic: "മൈക്രോഫോൺ പിന്തുണയില്ല"
    }
  };

  const currentContent = content[currentLanguage];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <Toaster />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-green-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  {currentContent.title}
                </h1>
                <p className="text-sm text-gray-600">{currentContent.subtitle}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant={currentLanguage === 'english' ? 'default' : 'outline'}
                size="sm"
                onClick={() => switchLanguage('english')}
                className="flex items-center space-x-1"
              >
                <Globe className="w-4 h-4" />
                <span>EN</span>
              </Button>
              <Button
                variant={currentLanguage === 'malayalam' ? 'default' : 'outline'}
                size="sm"
                onClick={() => switchLanguage('malayalam')}
                className="flex items-center space-x-1"
              >
                <Globe className="w-4 h-4" />
                <span>മല</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* FAQ Section */}
          <div className="lg:col-span-1">
            <Card className="h-fit shadow-lg border-green-200">
              <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-t-lg">
                <CardTitle className="text-lg">{currentContent.faqTitle}</CardTitle>
                <CardDescription className="text-green-100">
                  Click on a question to ask
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {faqData.map((faq, index) => (
                  <Card 
                    key={faq.id} 
                    className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-green-300 border-2 border-transparent"
                    onClick={() => handleFAQClick(faq)}
                  >
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-gray-800 leading-relaxed">
                        {faq.question}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Chat Section */}
          <div className="lg:col-span-2">
            <Card className="h-[600px] flex flex-col shadow-lg border-green-200">
              <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-t-lg">
                <CardTitle className="flex items-center space-x-2">
                  <Bot className="w-5 h-5" />
                  <span>Chat with {currentContent.title}</span>
                </CardTitle>
              </CardHeader>
              
              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-8">
                      <Bot className="w-12 h-12 mx-auto text-green-500 mb-4" />
                      <p className="text-gray-600">
                        {currentLanguage === 'english' 
                          ? "Hello! I'm Kisan Vani. Ask me anything about farming, crops, or government schemes."
                          : "ഹലോ! ഞാൻ കിസാൻ വാണിയാണ്. കൃഷി, വിളകൾ, സർക്കാർ പദ്ധതികൾ എന്നിവയെക്കുറിച്ച് എന്തും ചോദിക്കൂ."
                        }
                      </p>
                    </div>
                  )}
                  
                  {chatHistory.map((chat, index) => (
                    <div key={chat.id || index}>
                      {/* User Message */}
                      <div className="flex justify-end mb-2">
                        <div className="flex items-start space-x-2 max-w-[80%]">
                          <div className="bg-green-500 text-white rounded-2xl rounded-tr-sm px-4 py-2">
                            <p className="text-sm">{chat.message}</p>
                          </div>
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-green-100 text-green-600">
                              <User className="w-4 h-4" />
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                      
                      {/* AI Response */}
                      {chat.response && (
                        <div className="flex justify-start">
                          <div className="flex items-start space-x-2 max-w-[80%]">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="bg-emerald-100 text-emerald-600">
                                <Bot className="w-4 h-4" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2">
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">{chat.response}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-start space-x-2">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-emerald-100 text-emerald-600">
                            <Bot className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2">
                          <div className="flex items-center space-x-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm text-gray-600">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={chatEndRef} />
              </ScrollArea>
              
              <Separator />
              
              {/* Input Section */}
              <div className="p-4">
                <div className="flex space-x-2">
                  <div className="flex-1">
                    <Input
                      placeholder={currentContent.placeholder}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      className="border-green-200 focus:border-green-400"
                    />
                  </div>
                  
                  {browserSupportsSpeechRecognition && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={toggleListening}
                      className={`${listening ? 'bg-red-50 border-red-300 text-red-600' : 'bg-green-50 border-green-300 text-green-600'}`}
                    >
                      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                  )}
                  
                  <Button 
                    onClick={() => sendMessage()}
                    disabled={isLoading || !message.trim()}
                    className="bg-green-500 hover:bg-green-600"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                
                {listening && (
                  <div className="mt-2 flex items-center space-x-2 text-red-600">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm">{currentContent.listening}</span>
                  </div>
                )}
                
                {!browserSupportsSpeechRecognition && (
                  <p className="text-xs text-gray-500 mt-2">{currentContent.noMic}</p>
                )}
              </div>
            </Card>
          </div>
        </div>
        
        {/* Footer */}
        <div className="text-center mt-8">
          <Badge variant="outline" className="bg-white/60 backdrop-blur-sm">
            {currentContent.powered}
          </Badge>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<KisanVani />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;