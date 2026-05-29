import "@/assets/tailwind.css";
import Logo from "/icon/128.png";
import { CursorArrowRippleIcon } from "@heroicons/react/24/outline";

function App() {
  return (
    <div className="h-100 w-100 text-center text-2xl p-10 bg-blue-950 text-white flex flex-col items-center gap-4">
      <img src={Logo} alt="Logo" />
      <h1>WXT + React + TypeScript Starter Project</h1>
      <a
        href="https://www.finn.com/"
        target="__blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 border border-white p-4 rounded-lg cursor-pointer text-lg"
      >
        <CursorArrowRippleIcon width={24} height={24} />
        Go To FINN!
      </a>
    </div>
  );
}

export default App;
