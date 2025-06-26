
'use client';

import { useState, useRef, useEffect, KeyboardEvent, FormEvent, ChangeEvent } from 'react';
import { useChat } from '../hooks/use-chat';
import { useAuth } from '../hooks/use-auth';
import type { DecryptedMessage } from '../types';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { TriangleAlert } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { usePwaPush } from '../hooks/use-pwa-push';
import { cn } from '../lib/utils';

const loadingSequence = [
  'Booting secure kernel v2.1.8...',
  'Initializing virtual terminal...',
  'Mounting encrypted filesystem...',
  '[OK] Started Encrypted Channel Service.',
  '[OK] Probing for secure peer connection...',
  'Found peer. Establishing handshake...',
  'Handshake successful. Exchanging keys...',
  'Session secured with AES-256-GCM.',
  'Secure session established.',
  ' ',
  "Type 'sudo connect' to begin session."
];

const emergencyMessageText = "*** EMERGENCY DISCONNECT INITIATED BY PEER ***";

const urgentDecoyMessages = [
    'SYSTEM ALERT: High-frequency data burst detected.',
    'COMPILING KERNEL MODULE...',
    'WARNING: Unrecognized peer signature.',
    'ENCRYPTION LAYER RE-KEYING...',
    'RUNNING DIAGNOSTICS... PLEASE WAIT.',
    'PEER CONNECTION UNSTABLE. ATTEMPTING TO RE-ESTABLISH.',
    '*** REMOTE PROCESS EXCEEDED CPU QUOTA ***',
    'FLUSHING MEMORY CACHE TO DISK...',
    'SECURITY AUDIT IN PROGRESS...',
    'NETWORK LATENCY SPIKE DETECTED. ANALYZING...'
];


const initialVFS = {
  type: 'dir',
  children: {
    'home': {
      type: 'dir',
      children: {
        'admin': {
          type: 'dir',
          children: {
            '.bash_history': { type: 'file', content: 'ls\npwd\nclear' },
            'docs': {
              type: 'dir',
              children: {
                'project_plan.txt': { type: 'file', content: 'Initial project plan for TTY session app.' },
              }
            },
            'src': {
              type: 'dir',
              children: {
                'main.c': { type: 'file', content: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}' },
                'crypto.c': { type: 'file', content: '// AES-256 implementation' },
                'net.c': { type: 'file', content: '// P2P networking logic' },
                'ui.c': { type: 'file', content: '// Terminal UI rendering' },
              }
            },
            'tests': {
                type: 'dir',
                children: {
                  'test_crypto.c': { type: 'file', content: '// Unit tests for crypto module' },
                }
            },
            'fibonacci.py': { type: 'file', content: 'n = 10\na, b = 0, 1\nwhile a < n:\n    print(a)\n    a, b = b, a+b' },
            'palindrome_checker.py': { type: 'file', content: "s = 'level'\nif s == s[::-1]:\n    print(f'{s} is a palindrome')\nelse:\n    print(f'{s} is not a palindrome')" },
            'rectangle_area.py': { type: 'file', content: 'width = 12\nheight = 8\narea = width * height\nprint(f"The area is {area}")' },
          }
        }
      }
    },
    'etc': {
      type: 'dir',
      children: {
        'hosts': { type: 'file', content: '127.0.0.1       localhost\n::1             localhost ip6-localhost ip6-loopback\n127.0.1.1       secure-host' }
      }
    }
  }
};


export default function TtyChat() {
  const { isAuthenticated, isDecoyMode, user, login, logout, secret, sessionId, authLoading } = useAuth();
  const { messages, loading: chatLoading, sendMessage, sendUrgentNotificationMessage, sendFileMessage, connectWebRTC, isWebRTCConnected, clearChatHistory, urgentNotificationText } = useChat(isDecoyMode ? null : secret, sessionId);
  const { subscribe, unsubscribe, isSubscribed } = usePwaPush();
  const { toast } = useToast();
  
  const [status, setStatus] = useState<'loading' | 'guest' | 'password' | 'authenticated' | 'decoy'>('loading');
  const [terminalOutput, setTerminalOutput] = useState<(string | JSX.Element)[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isProcessRunning, setIsProcessRunning] = useState(false);
  const [decoyAction, setDecoyAction] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // VFS state for decoy mode
  const [vfs, setVfs] = useState(initialVFS);
  const [cwd, setCwd] = useState(['home', 'admin']);

  const processIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const initialBootDone = useRef(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (isAuthenticated && !isDecoyMode) {
      if (connectWebRTC) connectWebRTC();
      if (!isSubscribed) {
        subscribe();
      }
    }
  }, [isAuthenticated, isDecoyMode, connectWebRTC, isSubscribed, subscribe]);

  useEffect(() => {
    return () => {
      if (processIntervalRef.current) {
        clearInterval(processIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const terminal = terminalContainerRef.current;
    if (terminal) {
      const threshold = 100; // px
      const isScrolledToBottom = terminal.scrollHeight - terminal.clientHeight <= terminal.scrollTop + threshold;
      
      if (isScrolledToBottom) {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [terminalOutput, messages]);
  
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleResize = () => {
      const isVisible = visualViewport.height < window.innerHeight * 0.8;
      setIsKeyboardVisible(isVisible);
    };

    visualViewport.addEventListener('resize', handleResize);
    handleResize();

    return () => visualViewport.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (status === 'loading' && !initialBootDone.current) {
      initialBootDone.current = true;
      let i = 0;
      const interval = setInterval(() => {
        if (i < loadingSequence.length) {
          setTerminalOutput(prev => [...prev, loadingSequence[i]]);
          i++;
        } else {
          clearInterval(interval);
          setStatus('guest');
        }
      }, 150);
      return () => clearInterval(interval);
    }
  }, [status]);

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      if (isDecoyMode) {
        setStatus('decoy');
        setTerminalOutput([
            <p key="welcome">Authentication successful. Welcome, {user?.username}.</p>,
            <p key="decoy-welcome">Connected to secure server kernel v3.2.1.</p>,
            <p key="logout">Type 'logout' to disconnect session.</p>,
            <p key="separator" className="text-muted-foreground">---</p>,
        ]);
      } else if (status !== 'authenticated') {
        setStatus('authenticated');
        let authOutput = [
            <p key="welcome">Authentication successful. Welcome, {user?.username}.</p>,
            <p key="logout">Type '/logout' to disconnect session.</p>,
        ];
        if (!isWebRTCConnected) {
            authOutput.push(<p key="webrtc-status" className="text-muted-foreground">P2P: Connecting...</p>);
        } else {
            authOutput.push(<p key="webrtc-status" className="text-primary">P2P: Direct connection established.</p>);
        }
        authOutput.push(<p key="separator" className="text-muted-foreground">---</p>);
        setTerminalOutput(authOutput);
      }
    } else {
      if (status === 'authenticated' || status === 'decoy') {
        setStatus('loading');
        setTerminalOutput([]);
        initialBootDone.current = false;
      }
    }
  }, [isAuthenticated, isDecoyMode, status, user, isWebRTCConnected, authLoading]);
  
  const startFakeLogs = () => {
    setIsProcessRunning(true);
    setTerminalOutput(prev => [...prev, 'Initializing secure package manager...']);
    let count = 0;
    const totalLines = 200;
    
    const generateLogLine = () => {
        const prefixes = ['[INFO]', '[OK]', '[FETCH]', '[INSTALL]', '[CONFIG]', '[VERIFY]'];
        const packages = ['core-utils', 'linux-kernel-6.8.0', 'glibc-2.39', 'python3.12-dev', 'openssh-server', 'docker-ce', 'nvidia-driver-550', 'systemd-libs', 'lib-crypt.so.2'];
        const actions = ['Resolving dependencies for', 'Downloading', 'Verifying checksum for', 'Unpacking', 'Configuring', 'Running post-install script for'];
        const progress = Math.min(100, Math.round((count / totalLines) * 100));
        const randomPackage = packages[Math.floor(Math.random() * packages.length)];
        return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${actions[Math.floor(Math.random() * actions.length)]} ${randomPackage}... [${progress}%]`;
    };

    processIntervalRef.current = setInterval(() => {
        if (count < totalLines) {
            setTerminalOutput(prev => [...prev, generateLogLine()]);
            count++;
        } else {
            clearInterval(processIntervalRef.current!);
            processIntervalRef.current = null;
            setIsProcessRunning(false);
            setTerminalOutput(prev => [...prev, 'All packages installed successfully.']);
        }
    }, 50);
  };
  
  const startFakeFsck = () => {
    setIsProcessRunning(true);
    const output = [
      'fsck from util-linux 2.34',
      'e2fsck 1.45.5 (07-Jan-2020)',
      '/dev/sda1: recovering journal',
      'Checking inodes, blocks, and sizes...'
    ];
    let i = 0;
    processIntervalRef.current = setInterval(() => {
        if(i < output.length) {
            setTerminalOutput(prev => [...prev, output[i]]);
            i++;
        } else {
            clearInterval(processIntervalRef.current!);
            processIntervalRef.current = null;
            setIsProcessRunning(false);
            setTerminalOutput(prev => [...prev, '/dev/sda1: clean, 417853/30269440 files, 6088804/121064960 blocks']);
        }
    }, 400);
  };

  const startFakeCompile = () => {
    setIsProcessRunning(true);
    const output = [
      'gcc -O2 -c -o main.o src/main.c',
      'gcc -O2 -c -o crypto.o src/crypto.c',
      'gcc -O2 -c -o net.o src/net.c',
      'gcc -O2 -c -o ui.o src/ui.c',
      'ld -o tty-session main.o crypto.o net.o ui.o -lc',
      'Build successful.'
    ];
    let i = 0;
    processIntervalRef.current = setInterval(() => {
        if(i < output.length) {
            setTerminalOutput(prev => [...prev, output[i]]);
            i++;
        } else {
            clearInterval(processIntervalRef.current!);
            processIntervalRef.current = null;
            setIsProcessRunning(false);
        }
    }, 500);
  };
  
  const startFakePing = (host: string) => {
    setIsProcessRunning(true);
    const ip = `1${Math.floor(Math.random()*90)+10}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
    setTerminalOutput(prev => [...prev, `PING ${host} (${ip}) 56(84) bytes of data.`]);
    let seq = 1;
    processIntervalRef.current = setInterval(() => {
        const time = (Math.random() * 10 + 10).toFixed(1);
        setTerminalOutput(prev => [...prev, `64 bytes from ${host} (${ip}): icmp_seq=${seq} ttl=118 time=${time} ms`]);
        seq++;
    }, 1000);
  };
  
  useEffect(() => {
    if (decoyAction && status === 'decoy') {
        setTerminalOutput([]);
        switch(decoyAction) {
            case 'download': startFakeLogs(); break;
            case 'fsck': startFakeFsck(); break;
            case 'compile': startFakeCompile(); break;
        }
        setDecoyAction(null);
    }
  }, [decoyAction, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [status, isProcessRunning]);
  
  const renderMessage = (msg: DecryptedMessage) => {
    if (!sessionId) return null; // Don't render messages if session isn't loaded
    const isCurrentUser = msg.sessionId === sessionId;

    if (msg.text === emergencyMessageText) {
      return <p key={msg.id} className="text-destructive font-bold">{msg.text}</p>
    }

    if (msg.text === urgentNotificationText) {
       if (isCurrentUser) {
        return null;
      }
      const hash = msg.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const randomIndex = hash % urgentDecoyMessages.length;
      const decoyMessage = urgentDecoyMessages[randomIndex];
      return <p key={msg.id} className="text-yellow-400 font-bold">{decoyMessage}</p>
    }

    if ((msg.messageType === 'image' || msg.messageType === 'video')) {
      const fileType = msg.messageType;
      
      if (isCurrentUser) {
        return (
          <div key={msg.id}>
            <span className="text-primary">root@root</span>
            <span className="text-accent">:$~ </span>
            <span>Sent {fileType}: {msg.filename || `${fileType}.file`}</span>
          </div>
        );
      } else {
        return (
          <div key={msg.id}>
            <span className="text-secondary">sudo@root</span>
            <span className="text-accent">:$~ </span>
            {msg.localUrl ? (
                <span>
                Received {fileType}:{' '}
                <a
                    href={msg.localUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary hover:text-primary/80"
                >
                    {msg.filename || `${fileType}.file`}
                </a>
                {' '} (Click to view)
                </span>
            ) : (
                <span>Receiving {fileType}: {msg.filename || `${fileType}.file`}...</span>
            )}
          </div>
        );
      }
    }

    const authorName = isCurrentUser ? 'root' : 'sudo';
    const authorColor = isCurrentUser ? 'text-primary' : 'text-secondary';
    return (
      <div key={msg.id}>
        <span className={authorColor}>{authorName}@root</span>
        <span className="text-accent">:$~ </span>
        <span className="whitespace-pre-wrap">{msg.text}</span>
      </div>
    );
  };
  
  const handleAuthenticCommand = (command: string) => {
    const lowerCaseCommand = command.toLowerCase();
    
    switch (lowerCaseCommand) {
      case '/logout':
        unsubscribe();
        logout();
        break;
      case 'clear':
      case '/clear':
      case 'qc':
      case '/qc':
        if(clearChatHistory) {
          clearChatHistory();
          setTerminalOutput(prev => [...prev, 'Chat history permanently deleted.']);
        }
        break;
      default:
        if (lowerCaseCommand !== '/img' && !lowerCaseCommand.startsWith('/urgent')) {
            setTerminalOutput(prev => [...prev, `bash: ${command}: command not found`]);
        }
    }
  };

  const startAutoMode = () => {
    setIsProcessRunning(true);

    const commands = [
      'ls -a',
      'pwd',
      'git status',
      'df',
      'python fibonacci.py',
      'top',
      'clear'
    ];
    let commandIndex = 0;

    const runNextCommand = () => {
      if (commandIndex >= commands.length) {
        setIsProcessRunning(false);
        setTerminalOutput(prev => [...prev, 'Auto sequence complete.']);
        return;
      }

      const command = commands[commandIndex];
      setTerminalOutput(prev => [...prev, <div key={`auto-${prev.length}`}>{renderPrompt('decoy')}<span className="whitespace-pre">{command}</span></div>]);
      handleDecoyCommand(command);
      commandIndex++;
      
      const delay = Math.random() * 2000 + 1000;
      setTimeout(runNextCommand, delay);
    };

    setTerminalOutput(prev => [...prev, 'Starting auto sequence...']);
    setTimeout(runNextCommand, 1000);
  };
  
    const resolvePath = (path: string) => {
        const pathSegments = path.split('/').filter(p => p);
        let newCwd;

        if (path.startsWith('/')) {
            newCwd = [];
        } else {
            newCwd = [...cwd];
        }

        for (const segment of pathSegments) {
            if (segment === '..') {
                if (newCwd.length > 0) newCwd.pop();
            } else if (segment !== '.') {
                newCwd.push(segment);
            }
        }
        return newCwd;
    };

    const getNodeByPath = (pathSegments: string[]) => {
        let currentNode: any = vfs;
        for (const segment of pathSegments) {
            if (currentNode && currentNode.type === 'dir' && currentNode.children[segment]) {
                currentNode = currentNode.children[segment];
            } else {
                return null;
            }
        }
        return currentNode;
    };
    
  const handleDecoyCommand = (command: string) => {
    const [cmd, ...args] = command.split(' ');
    const lowerCmd = cmd.toLowerCase();

    const currentDirNode = getNodeByPath(cwd);

    switch (lowerCmd) {
      case 'logout':
        logout();
        break;
      case 'clear':
      case 'qc':
        setTerminalOutput([]);
        break;
      case 'ls':
        if (!currentDirNode || currentDirNode.type !== 'dir') {
          setTerminalOutput(prev => [...prev, 'ls: cannot access .: No such file or directory']);
          return;
        }
        const showAll = args.includes('-a');
        const items = Object.keys(currentDirNode.children)
            .filter(name => showAll || !name.startsWith('.'))
            .sort();
        const output = items.map(item => {
            const node = currentDirNode.children[item];
            return <span key={item} className={node.type === 'dir' ? 'text-blue-400' : ''}>{item}</span>;
        });
        setTerminalOutput(prev => [...prev, <div className="flex flex-wrap gap-x-4">{output}</div>]);
        break;
      case 'pwd':
        setTerminalOutput(prev => [...prev, '/' + cwd.join('/')]);
        break;
      case 'cd':
        const newPath = args[0] || '';
        const newCwdSegments = resolvePath(newPath);
        const targetNode = getNodeByPath(newCwdSegments);
        if (targetNode && targetNode.type === 'dir') {
          setCwd(newCwdSegments);
        } else {
          setTerminalOutput(prev => [...prev, `cd: no such file or directory: ${newPath}`]);
        }
        break;
      case 'mkdir':
        if (!args[0]) {
            setTerminalOutput(prev => [...prev, `mkdir: missing operand`]);
            return;
        }
        if (!currentDirNode || currentDirNode.type !== 'dir') return;
        
        const newDirName = args[0];
        if (currentDirNode.children[newDirName]) {
            setTerminalOutput(prev => [...prev, `mkdir: cannot create directory ‘${newDirName}’: File exists`]);
        } else {
            currentDirNode.children[newDirName] = { type: 'dir', children: {} };
            setVfs({ ...vfs });
        }
        break;
    case 'touch':
        if (!args[0]) {
            setTerminalOutput(prev => [...prev, `touch: missing file operand`]);
            return;
        }
        if (!currentDirNode || currentDirNode.type !== 'dir') return;

        const newFileName = args[0];
        if (!currentDirNode.children[newFileName]) {
            currentDirNode.children[newFileName] = { type: 'file', content: '' };
            setVfs({ ...vfs });
        } // if it exists, touch just updates timestamp, we can ignore that.
        break;
    case 'rm':
        if (!args[0]) {
            setTerminalOutput(prev => [...prev, `rm: missing operand`]);
            return;
        }
        if (!currentDirNode || currentDirNode.type !== 'dir') return;

        const itemNameToRemove = args[0];
        const itemToRemove = currentDirNode.children[itemNameToRemove];

        if (!itemToRemove) {
            setTerminalOutput(prev => [...prev, `rm: cannot remove '${itemNameToRemove}': No such file or directory`]);
        } else if (itemToRemove.type === 'dir' && Object.keys(itemToRemove.children).length > 0) {
            setTerminalOutput(prev => [...prev, `rm: cannot remove '${itemNameToRemove}': Directory not empty`]);
        } else {
            delete currentDirNode.children[itemNameToRemove];
            setVfs({ ...vfs });
        }
        break;
      case 'cat':
        const catPath = resolvePath(args[0] || '');
        const fileNode = getNodeByPath(catPath);
        if (fileNode && fileNode.type === 'file') {
          setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{fileNode.content}</pre>]);
        } else if (fileNode && fileNode.type === 'dir') {
          setTerminalOutput(prev => [...prev, `cat: ${args[0]}: Is a directory`]);
        } else {
          setTerminalOutput(prev => [...prev, `cat: ${args[0]}: No such file or directory`]);
        }
        break;
    case 'echo':
        const echoMatch = command.match(/^echo\s+"([^"]+)"\s*>\s*(\S+)/);
        if (echoMatch) {
            const text = echoMatch[1];
            const fileName = echoMatch[2];
            if (currentDirNode && currentDirNode.type === 'dir') {
                const targetNode = currentDirNode.children[fileName];
                if(targetNode && targetNode.type === 'dir') {
                    setTerminalOutput(prev => [...prev, `bash: ${fileName}: Is a directory`]);
                } else {
                    currentDirNode.children[fileName] = { type: 'file', content: text };
                    setVfs({ ...vfs });
                }
            }
        } else {
            const textToEcho = command.substring(5);
            setTerminalOutput(prev => [...prev, textToEcho]);
        }
        break;
      case 'whoami':
        setTerminalOutput(prev => [...prev, user?.username || 'admin']);
        break;
      case 'uname':
        setTerminalOutput(prev => [...prev, `Linux secure-host 5.4.0-109-generic #123-Ubuntu SMP Tue... x86_64`]);
        break;
      case 'df':
        setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{
`Filesystem     1K-blocks      Used Available Use% Mounted on
udev            4041604         0   4041604   0% /dev
tmpfs            815960      2300    813660   1% /run
/dev/sda1      60483568  12083568  45299900  22% /`
        }</pre>]);
        break;
       case 'top':
         setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{
`top - 10:42:01 up 12 days,  2:15,  1 user,  load average: 0.01, 0.03, 0.00
Tasks: 212 total,   1 running, 211 sleeping,   0 stopped,   0 zombie
%Cpu(s):  0.1 us,  0.1 sy,  0.0 ni, 99.8 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :  15892.3 total,   8452.4 free,   3450.6 used,   3989.3 buff/cache
MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.  12041.7 avail Mem

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
   1234 root      20   0  2.5g   1.2g  89.1m S   0.3   7.9   1:34.56 systemd
   5678 admin     20   0  1.8g 789.2m  45.6m S   0.1   4.9   0:45.12 sshd
   9101 root      20   0  1.2g 456.7m  33.2m S   0.1   2.8   0:12.34 docker`
         }</pre>]);
         break;
      case 'ping':
        startFakePing(args[0] || 'google.com');
        break;
      case 'netstat':
          if (args[0] === '-tuln') {
            setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{
`Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State      
tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN     
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN     
tcp6       0      0 :::22                   :::*                    LISTEN`
          }</pre>]);
          } else {
            setTerminalOutput(prev => [...prev, `netstat: invalid option -- '${(args[0] || "").replace(/^-+/, '')}'`]);
          }
          break;
      case 'history':
        setTerminalOutput(prev => [
            ...prev, 
            ...history.map((h, i) => <div key={`hist-${i}`}>{` ${history.length - i}  ${h}`}</div>).reverse()
        ]);
        break;
      case 'help':
        setTerminalOutput(prev => [...prev, `Available commands: logout, clear, ls, cd, pwd, mkdir, touch, rm, cat, echo, whoami, uname, df, top, ping, netstat, history, download, fsck, compile, python, git, auto, help.
Try running 'python fibonacci.py'`]);
        break;
      case 'download':
        startFakeLogs();
        break;
      case 'fsck':
        startFakeFsck();
        break;
      case 'compile':
        startFakeCompile();
        break;
      case 'python':
        const scriptPath = resolvePath(args[0] || '');
        const scriptNode = getNodeByPath(scriptPath);
        if (scriptNode && scriptNode.type === 'file' && args[0].endsWith('.py')) {
            let scriptOutput = `Running script: ${args[0]}\n...`;
             if (args[0].endsWith('fibonacci.py')) {
                scriptOutput = `Running script: fibonacci.py\nGenerating sequence up to n=10...\nResult: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34\nScript finished successfully.`;
             } else if (args[0].endsWith('palindrome_checker.py')) {
                scriptOutput = `Running script: palindrome_checker.py\nInput string: 'level'\nChecking...\nResult: 'level' is a palindrome.\nScript finished successfully.`;
             } else if (args[0].endsWith('rectangle_area.py')) {
                 scriptOutput = `Running script: rectangle_area.py\nInput width: 12, height: 8\nCalculating area...\nResult: Area is 96.\nScript finished successfully.`;
             }
            setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{scriptOutput}</pre>]);
        } else {
            setTerminalOutput(prev => [...prev, `python: can't open file '${args[0]}': [Errno 2] No such file or directory`]);
        }
        break;
      case 'git':
          if (args[0] === 'status') {
              setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{
`On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean`
              }</pre>]);
          } else if (args[0] === 'log') {
               setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{
`commit a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0 (HEAD -> main, origin/main)
Author: Alex Johnson <alex@dev-corp.com>
Date:   Tue Jul 2 11:30:45 2024 -0700

    feat: Implement real-time data streaming

commit 9f8e7d6c5b4a3c2b1a09e8f7d6c5b4a3c2b1a098
Author: Maria Garcia <maria@dev-corp.com>
Date:   Mon Jul 1 16:20:10 2024 -0700

    fix: Corrected authentication token refresh logic`
               }</pre>]);
          } else if (args[0] === 'pull') {
               setTerminalOutput(prev => [...prev, <pre key={prev.length} className="whitespace-pre-wrap">{
`From github.com:secure-corp/core-services
 * branch            main       -> FETCH_HEAD
Already up to date.`
               }</pre>]);
          } else {
              setTerminalOutput(prev => [...prev, `git: '${args[0] || ''}' is not a git command. See 'git --help'.`]);
          }
          break;
      case 'auto':
        startAutoMode();
        break;
      default:
        setTerminalOutput(prev => [...prev, `bash: ${command}: command not found`]);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (e.target) e.target.value = '';
    
    if (user && sessionId) {
        if (!isWebRTCConnected) {
            toast({ title: "P2P Not Connected", description: "Direct connection not established. Cannot send files.", variant: "destructive" });
            return;
        }
        setTerminalOutput(prev => [...prev, `[system] Initiating direct transfer for ${file.name}...`]);
        await sendFileMessage(file, user.username, sessionId);
    } else {
        toast({ title: "Upload Error", description: "You must be logged in to send files.", variant: "destructive" });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isProcessRunning) return;
    const commandLine = inputValue;
    const trimmedCommand = commandLine.trim();

    setInputValue('');
    if (trimmedCommand) {
      setHistory(prev => [trimmedCommand, ...prev].slice(0, 50));
    }
    setHistoryIndex(-1);

    const currentPrompt = renderPrompt(status);

    if (status === 'guest') {
      setTerminalOutput(prev => [...prev, <div key={prev.length}>{currentPrompt}{commandLine}</div>]);
      const lowerCaseCommand = trimmedCommand.toLowerCase();
      
      if (lowerCaseCommand === 'sudo connect') {
        setStatus('password');
      } else if (trimmedCommand) {
        switch (lowerCaseCommand) {
            case 'help':
                setTerminalOutput(prev => [...prev, "Basic commands: help, whoami, date, uname, clear, ls, pwd. Use 'sudo connect' to login."]);
                break;
            case 'whoami':
                setTerminalOutput(prev => [...prev, 'guest']);
                break;
            case 'date':
                setTerminalOutput(prev => [...prev, new Date().toString()]);
                break;
            case 'uname':
                 setTerminalOutput(prev => [...prev, 'Linux tty-secure-host 2.1.8-generic x86_64']);
                 break;
            case 'clear':
                 setTerminalOutput([]);
                 break;
            case 'ls':
                 setTerminalOutput(prev => [...prev, 'README.md  connect.sh']);
                 break;
            case 'pwd':
                 setTerminalOutput(prev => [...prev, '/home/guest']);
                 break;
            default:
                setTerminalOutput(prev => [...prev, `bash: ${trimmedCommand}: command not found`]);
        }
      }
    } else if (status === 'password') {
      setTerminalOutput(prev => [...prev, <div key={prev.length}>{currentPrompt}</div>]);
      const success = login(commandLine);
      if (!success) {
        setTimeout(() => {
          setTerminalOutput(prev => [...prev, 'sudo: incorrect password attempt.']);
          setStatus('guest');
        }, 300);
      }
    } else if (status === 'authenticated') {
        const lowerCaseCommand = trimmedCommand.toLowerCase();
      
        if (trimmedCommand.startsWith('/') || ['qc', 'clear'].includes(lowerCaseCommand)) {
            setTerminalOutput(prev => [...prev, <div key={prev.length}>{currentPrompt}<span className="whitespace-pre">{commandLine}</span></div>]);
            
            if (lowerCaseCommand.startsWith('/urgent')) {
                if (user && sessionId && sendUrgentNotificationMessage) {
                    sendUrgentNotificationMessage(user.username, sessionId);
                    setTerminalOutput(prev => [...prev, <div key={`response-${prev.length}`} className="text-muted-foreground">[System] Urgent notification sent to peer.</div>]);
                }
                return;
            }
            
            if (lowerCaseCommand === '/img') {
                fileInputRef.current?.click();
                return;
            }
            
            handleAuthenticCommand(trimmedCommand);
        } else if (user && trimmedCommand && sessionId) {
            sendMessage(trimmedCommand, user.username, sessionId);
        }
    } else if (status === 'decoy') {
        if(trimmedCommand) {
            setTerminalOutput(prev => [...prev, <div key={prev.length}>{currentPrompt}<span className="whitespace-pre">{commandLine}</span></div>]);
            handleDecoyCommand(trimmedCommand);
        } else {
            setTerminalOutput(prev => [...prev, <div key={prev.length}>{currentPrompt}<span className="whitespace-pre">{commandLine}</span></div>]);
        }
    }
  };
  
  const handleEmergency = async () => {
    if (user && sessionId) {
      await sendMessage(emergencyMessageText, user.username, sessionId);
    }
    const actions = ['download', 'fsck', 'compile'];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    enterDecoyMode();
    setDecoyAction(randomAction);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isProcessRunning) {
      if (e.ctrlKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        clearInterval(processIntervalRef.current!);
        processIntervalRef.current = null;
        setIsProcessRunning(false);
        setTerminalOutput(prev => [...prev, '^C', 'User interrupt.']);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(newIndex >= 0 ? history[newIndex] : '');
      }
    }
  };

  const renderPrompt = (currentStatus: typeof status) => {
      const currentPath = `~/${cwd.slice(2).join('/') || ''}`;
      switch (currentStatus) {
        case 'guest':
          return <><span className="text-primary">user@user</span><span className="text-accent">:~$ </span></>;
        case 'password':
          return <><span className="text-accent">[sudo] password for user:&nbsp;</span></>;
        case 'decoy':
          return <><span className="text-primary">{user?.username || 'admin'}@secure-host</span><span className="text-accent">:{currentPath}$ </span></>;
        case 'authenticated':
          return <><span className="text-primary">{user?.username || 'root'}@root</span><span className="text-accent">:$~ </span></>;
        default:
          return null;
      }
  }
  
  return (
    <div className="flex flex-col h-dvh p-4 font-mono text-base relative" onClick={() => inputRef.current?.focus()}>
      <div ref={terminalContainerRef} className="flex-grow overflow-y-auto">
        {terminalOutput.map((line, index) => (
          <div key={`terminal-line-${index}`}>{typeof line === 'string' ? <span className="whitespace-pre-wrap">{line}</span> : line}</div>
        ))}
        
        {isAuthenticated && !isDecoyMode && !authLoading && messages.map(renderMessage)}

        {(chatLoading || (authLoading && isAuthenticated)) && (
          <div key="skeleton" className="pt-2 flex items-center">
            <span className="text-primary">{user?.username || 'root'}@root</span>
            <span className="text-accent">:$~ </span>
            <Skeleton className="h-4 w-1/4 ml-2" />
          </div>
        )}
        
        {status !== 'loading' && (
          <div className="flex items-center">
            {renderPrompt(status)}
             <form onSubmit={handleSubmit} className="flex-1 flex items-center">
                <input
                    ref={inputRef}
                    type={status === 'password' ? 'password' : 'text'}
                    value={inputValue}
                    onChange={(e) => {
                        if (!isProcessRunning) {
                          setInputValue(e.target.value);
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      "flex-1 bg-transparent border-none p-0 focus:ring-0 font-mono text-base outline-none",
                      status === 'password' ? "text-transparent caret-transparent selection:bg-transparent" : "text-foreground"
                    )}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    autoFocus
                    disabled={isProcessRunning}
                />
            </form>

            {isProcessRunning && (
              <span className="text-muted-foreground animate-pulse">Process running... (Ctrl+C to interrupt)</span>
            )}
            
            {!isProcessRunning && status !== 'password' && (
              <span className="inline-block w-2 h-4 bg-foreground animate-pulse" />
            )}
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>
      
      {isAuthenticated && !isDecoyMode && (
        <Button
          variant="destructive"
          size="icon"
          className={cn(
            "absolute right-4 h-10 w-10 rounded-full opacity-50 hover:opacity-100 transition-all duration-300",
            isKeyboardVisible ? "bottom-24" : "bottom-4"
          )}
          onClick={handleEmergency}
          title="Emergency Disconnect"
        >
          <TriangleAlert className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
