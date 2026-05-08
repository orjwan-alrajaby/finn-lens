import "@/assets/tailwind.css";
import Logo from "/icon/128.png";
import { BellAlertIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

function App() {
  return (
    <div className="h-100 w-100 text-center text-2xl p-10 bg-blue-950 text-white flex flex-col items-center gap-4">
      <img src={Logo} alt="Logo" />
      <h1>WXT + React + TypeScript Starter Project</h1>
      <button
        onClick={() => {
          toast.success("Toast is working successfully!")
        }}
        className="flex items-center gap-2 border border-white p-4 rounded-lg cursor-pointer text-lg"
      >
        <BellAlertIcon width={24} height={24} />
        Click to alert!
      </button>
    </div>
  );
}

export default App;
