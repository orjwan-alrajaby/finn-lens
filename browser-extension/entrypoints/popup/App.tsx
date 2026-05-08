import "@/assets/tailwind.css";
import Logo from "/icon/128.png";

function App() {
  return (
    <div className="h-100 w-100 text-center text-2xl p-10 bg-blue-950 text-white flex flex-col items-center gap-4">
      <img src={Logo} alt="Logo" />
      <h1>WXT + React + TypeScript Starter Project</h1>
    </div>
  );
}

export default App;
