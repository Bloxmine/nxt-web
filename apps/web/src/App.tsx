import { EditorArea } from './components/EditorArea';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { SupportBanner } from './components/SupportBanner';
import { checkBrowserSupport } from './lib/browserSupport';

const support = checkBrowserSupport(navigator);

export function App() {
  return (
    <div className="flex h-full flex-col">
      <Header />
      <SupportBanner support={support} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <EditorArea />
      </div>
      <StatusBar />
    </div>
  );
}
