import AssistantDisplay from "./components/AssistantDisplay";
import ImageDisplay from "./components/ImageDisplay";
import RecommendDisplay from "./components/RecommendDisplay";

export default function Home() {
  return (
    <div>
      <h1>Emotion Detection</h1>
      <RecommendDisplay />
      <ImageDisplay />
      <AssistantDisplay />
    </div>
  );
}
