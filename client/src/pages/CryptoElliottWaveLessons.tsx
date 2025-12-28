import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Link } from 'wouter';
import { ArrowLeft, GraduationCap, TrendingUp, TrendingDown, CheckCircle2, XCircle, ChevronRight, BookOpen, Target, Zap, Brain, Award } from 'lucide-react';
import bearTecLogoNew from '@assets/beartec logo_1763645889028.png';
import { CryptoNavigation } from '@/components/CryptoNavigation';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface LessonProgress {
  [lessonId: string]: {
    completed: boolean;
    quizScore?: number;
  };
}

const WAVE_DEGREES = [
  { name: 'Grand Supercycle', notation: '(I) (II) (III)', timeframe: 'Multi-decade' },
  { name: 'Supercycle', notation: '(I) (II) (III)', timeframe: 'Years to decades' },
  { name: 'Cycle', notation: 'I II III IV V', timeframe: 'Months to years' },
  { name: 'Primary', notation: '① ② ③ ④ ⑤', timeframe: 'Weeks to months' },
  { name: 'Intermediate', notation: '(1) (2) (3) (4) (5)', timeframe: 'Days to weeks' },
  { name: 'Minor', notation: '1 2 3 4 5', timeframe: 'Hours to days' },
  { name: 'Minute', notation: 'i ii iii iv v', timeframe: 'Hours' },
  { name: 'Minuette', notation: '(i) (ii) (iii)', timeframe: 'Minutes to hours' },
  { name: 'Subminuette', notation: '① ② ③', timeframe: 'Minutes' },
];

export default function CryptoElliottWaveLessons() {
  const [progress, setProgress] = useState<LessonProgress>(() => {
    const saved = localStorage.getItem('elliottWaveLessonProgress');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<string, boolean>>({});

  const saveProgress = useCallback((lessonId: string, data: { completed: boolean; quizScore?: number }) => {
    setProgress(prev => {
      const updated = { ...prev, [lessonId]: data };
      localStorage.setItem('elliottWaveLessonProgress', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleQuizAnswer = (quizId: string, questionIndex: number, answerIndex: number) => {
    setQuizAnswers(prev => ({
      ...prev,
      [`${quizId}-${questionIndex}`]: answerIndex
    }));
  };

  const submitQuiz = (quizId: string, questions: QuizQuestion[]) => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (quizAnswers[`${quizId}-${i}`] === q.correctIndex) {
        correct++;
      }
    });
    const score = Math.round((correct / questions.length) * 100);
    setQuizSubmitted(prev => ({ ...prev, [quizId]: true }));
    saveProgress(quizId, { completed: true, quizScore: score });
  };

  const resetQuiz = (quizId: string, questionCount: number) => {
    const newAnswers = { ...quizAnswers };
    for (let i = 0; i < questionCount; i++) {
      delete newAnswers[`${quizId}-${i}`];
    }
    setQuizAnswers(newAnswers);
    setQuizSubmitted(prev => ({ ...prev, [quizId]: false }));
  };

  const completedLessons = Object.values(progress).filter(p => p.completed).length;
  const totalLessons = 6;
  const overallProgress = Math.round((completedLessons / totalLessons) * 100);

  const QuizComponent = ({ quizId, questions }: { quizId: string; questions: QuizQuestion[] }) => {
    const isSubmitted = quizSubmitted[quizId];
    const score = progress[quizId]?.quizScore;

    return (
      <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-[#2a2e39]">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-[#00c4b4] flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Knowledge Check
          </h4>
          {isSubmitted && (
            <div className="flex items-center gap-2">
              <Badge variant={score && score >= 70 ? "default" : "destructive"} className={score && score >= 70 ? "bg-green-600" : ""}>
                Score: {score}%
              </Badge>
              <Button size="sm" variant="outline" onClick={() => resetQuiz(quizId, questions.length)} data-testid={`button-reset-quiz-${quizId}`}>
                Retry
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {questions.map((q, qIndex) => {
            const selectedAnswer = quizAnswers[`${quizId}-${qIndex}`];
            const isCorrect = selectedAnswer === q.correctIndex;

            return (
              <div key={q.id} className="space-y-3">
                <p className="text-white font-medium">{qIndex + 1}. {q.question}</p>
                <div className="grid gap-2">
                  {q.options.map((option, oIndex) => {
                    const isSelected = selectedAnswer === oIndex;
                    const showResult = isSubmitted;
                    const isCorrectOption = oIndex === q.correctIndex;

                    return (
                      <button
                        key={oIndex}
                        onClick={() => !isSubmitted && handleQuizAnswer(quizId, qIndex, oIndex)}
                        disabled={isSubmitted}
                        className={`p-3 text-left rounded-lg border transition-all ${
                          showResult
                            ? isCorrectOption
                              ? 'border-green-500 bg-green-500/20 text-green-300'
                              : isSelected && !isCorrect
                                ? 'border-red-500 bg-red-500/20 text-red-300'
                                : 'border-gray-700 text-gray-400'
                            : isSelected
                              ? 'border-[#00c4b4] bg-[#00c4b4]/20 text-white'
                              : 'border-gray-700 hover:border-gray-500 text-gray-300'
                        }`}
                        data-testid={`quiz-option-${quizId}-${qIndex}-${oIndex}`}
                      >
                        <div className="flex items-center gap-2">
                          {showResult && isCorrectOption && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          {showResult && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-500" />}
                          <span>{option}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {isSubmitted && (
                  <div className={`p-3 rounded-lg text-sm ${isCorrect ? 'bg-green-900/30 text-green-300' : 'bg-amber-900/30 text-amber-300'}`}>
                    <strong>{isCorrect ? '✓ Correct!' : '✗ Incorrect.'}</strong> {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isSubmitted && (
          <Button
            className="mt-6 w-full bg-[#00c4b4] hover:bg-[#00a89a]"
            onClick={() => submitQuiz(quizId, questions)}
            disabled={Object.keys(quizAnswers).filter(k => k.startsWith(quizId)).length < questions.length}
            data-testid={`button-submit-quiz-${quizId}`}
          >
            Submit Answers
          </Button>
        )}
      </div>
    );
  };

  const impulseQuiz: QuizQuestion[] = [
    {
      id: 'imp1',
      question: 'In an impulse wave, which wave cannot be the shortest?',
      options: ['Wave 1', 'Wave 2', 'Wave 3', 'Wave 5'],
      correctIndex: 2,
      explanation: 'Wave 3 can never be the shortest of the motive waves (1, 3, 5). It is typically the longest and most powerful wave in an impulse.'
    },
    {
      id: 'imp2',
      question: 'Wave 4 in an impulse must not overlap with which wave?',
      options: ['Wave 1 territory', 'Wave 2 territory', 'Wave 3 territory', 'Wave 5 territory'],
      correctIndex: 0,
      explanation: 'Wave 4 cannot enter the price territory of Wave 1. This is a cardinal rule of impulse waves (with the exception of diagonals).'
    },
    {
      id: 'imp3',
      question: 'What internal wave structure does Wave 3 have in an impulse?',
      options: ['3-wave (abc)', '5-wave motive', 'Triangle (5 legs)', 'Double combination'],
      correctIndex: 1,
      explanation: 'Waves 1, 3, and 5 in an impulse are all motive waves with 5-wave internal structures. Waves 2 and 4 are corrective (3-wave structures).'
    }
  ];

  const diagonalQuiz: QuizQuestion[] = [
    {
      id: 'diag1',
      question: 'What is the internal structure of waves in a leading diagonal?',
      options: ['5-3-5-3-5', '3-3-3-3-3', '5-5-5-5-5', '3-5-3-5-3'],
      correctIndex: 1,
      explanation: 'Leading diagonals have an internal structure of 3-3-3-3-3, meaning all five waves are three-wave (corrective) patterns.'
    },
    {
      id: 'diag2',
      question: 'Where can an ending diagonal appear?',
      options: ['Wave 1 or Wave A only', 'Wave 3 only', 'Wave 5 or Wave C only', 'Any wave position'],
      correctIndex: 2,
      explanation: 'Ending diagonals appear in the final wave position - Wave 5 of an impulse or Wave C of a correction.'
    },
    {
      id: 'diag3',
      question: 'In a contracting diagonal, what happens to the wave lengths?',
      options: ['Wave 3 > Wave 1, Wave 5 > Wave 3', 'Wave 3 < Wave 1, Wave 5 < Wave 3', 'All waves are equal', 'Wave 1 is always the longest'],
      correctIndex: 1,
      explanation: 'In a contracting diagonal, each successive wave is shorter than the previous: Wave 3 < Wave 1, Wave 5 < Wave 3, Wave 4 < Wave 2.'
    }
  ];

  const correctiveQuiz: QuizQuestion[] = [
    {
      id: 'corr1',
      question: 'What is the structure of a zigzag correction?',
      options: ['3-3-5', '5-3-5', '3-3-3', '5-5-5'],
      correctIndex: 1,
      explanation: 'A zigzag has a 5-3-5 structure. Waves A and C are five-wave motive patterns, while Wave B is a three-wave correction.'
    },
    {
      id: 'corr2',
      question: 'In a flat correction, Wave B typically retraces how much of Wave A?',
      options: ['38.2% to 50%', '50% to 61.8%', '90% to 105%', '127% to 161.8%'],
      correctIndex: 2,
      explanation: 'In a regular flat, Wave B retraces 90-105% of Wave A. In an expanded flat, Wave B exceeds the start of Wave A (>100%).'
    },
    {
      id: 'corr3',
      question: 'How many waves does a triangle correction have?',
      options: ['3 waves (A-B-C)', '4 waves (A-B-C-D)', '5 waves (A-B-C-D-E)', '7 waves'],
      correctIndex: 2,
      explanation: 'Triangles have 5 waves labeled A-B-C-D-E, with each wave being a 3-wave (corrective) structure internally.'
    }
  ];

  const complexQuiz: QuizQuestion[] = [
    {
      id: 'comp1',
      question: 'What letter labels the connecting wave between two corrective patterns in a double combination?',
      options: ['A', 'B', 'X', 'Z'],
      correctIndex: 2,
      explanation: 'The X wave connects two corrective patterns (W and Y) in a double combination (WXY).'
    },
    {
      id: 'comp2',
      question: 'A WXY pattern has what overall structure?',
      options: ['5-3-5', '3-X-3', '3-3-3', '5-3-3-3-5'],
      correctIndex: 1,
      explanation: 'A WXY double combination is two three-wave patterns (W and Y) connected by an X wave, creating a 3-X-3 structure.'
    },
    {
      id: 'comp3',
      question: 'In Elliott Wave theory, when do complex corrections typically form?',
      options: ['In Wave 3 positions', 'When market needs more time/price correction', 'Only in bear markets', 'At market tops only'],
      correctIndex: 1,
      explanation: 'Complex corrections form when simple patterns (zigzag, flat) don\'t achieve sufficient time or price correction. Markets extend the correction through combination patterns.'
    }
  ];

  const fibQuiz: QuizQuestion[] = [
    {
      id: 'fib1',
      question: 'Wave 2 typically retraces what percentage of Wave 1?',
      options: ['23.6% to 38.2%', '38.2% to 78.6%', '100% exactly', '127% to 161.8%'],
      correctIndex: 1,
      explanation: 'Wave 2 commonly retraces 38.2% to 78.6% of Wave 1. The 50% and 61.8% levels are most common. Deep retracements (78.6%) are still valid but suggest weakness.'
    },
    {
      id: 'fib2',
      question: 'Wave 3 is often what Fibonacci extension of Wave 1?',
      options: ['100%', '127.2%', '161.8%', 'Any of these'],
      correctIndex: 3,
      explanation: 'Wave 3 commonly extends to 161.8%, 200%, 261.8%, or even 423.6% of Wave 1. It cannot be the shortest but can be any of these extensions.'
    },
    {
      id: 'fib3',
      question: 'In a zigzag, Wave C is commonly what relationship to Wave A?',
      options: ['61.8% of A', '100% or 161.8% of A', '200% of A only', '50% of A'],
      correctIndex: 1,
      explanation: 'In zigzags, Wave C often equals Wave A (100%) or extends to 161.8% of Wave A. Equality (C=A) is the most common relationship.'
    }
  ];

  const degreeQuiz: QuizQuestion[] = [
    {
      id: 'deg1',
      question: 'Which degree is larger: Primary or Intermediate?',
      options: ['Intermediate', 'Primary', 'They are equal', 'Depends on timeframe'],
      correctIndex: 1,
      explanation: 'Primary is a larger degree than Intermediate. The hierarchy from largest to smallest: Supercycle > Cycle > Primary > Intermediate > Minor.'
    },
    {
      id: 'deg2',
      question: 'A Minor degree impulse wave contains what degree of subwaves?',
      options: ['Primary waves', 'Intermediate waves', 'Minute waves', 'Subminuette waves'],
      correctIndex: 2,
      explanation: 'Each degree contains subwaves of the next smaller degree. Minor waves contain Minute subwaves, Minute contains Minuette, etc.'
    },
    {
      id: 'deg3',
      question: 'Why is wave degree identification important?',
      options: ['It determines the color of chart labels', 'It helps identify where you are in the larger structure', 'It only matters for academic purposes', 'It predicts exact price targets'],
      correctIndex: 1,
      explanation: 'Degree identification helps traders understand their position within the larger market structure and set appropriate expectations for wave targets and timeframes.'
    }
  ];

  return (
    <>
      <Helmet>
        <title>Elliott Wave Lessons - Advanced Pattern Training | BearTec</title>
        <meta name="description" content="Interactive Elliott Wave training covering impulse waves, diagonal patterns, corrections, complex patterns, Fibonacci relationships, and wave degrees. Master professional wave analysis." />
        <meta property="og:title" content="Elliott Wave Lessons - Advanced Pattern Training" />
        <meta property="og:description" content="Master Elliott Wave theory with interactive lessons and quizzes on advanced patterns." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="min-h-screen bg-[#0e0e0e] text-white p-4 md:p-6 pb-20">
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div className="flex justify-center mb-6">
            <img 
              src={bearTecLogoNew} 
              alt="BearTec Logo" 
              className="h-[100px] md:h-[120px] w-auto object-contain"
            />
          </div>

          <Link href="/crypto/training">
            <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a]" data-testid="button-back-training">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Training
            </Button>
          </Link>

          <div className="flex items-center gap-3 mb-4">
            <GraduationCap className="w-8 h-8 text-[#00c4b4]" />
            <h1 className="text-2xl md:text-3xl font-bold">Elliott Wave Mastery</h1>
          </div>

          <Card className="bg-gradient-to-r from-[#00c4b4]/10 to-purple-600/10 border-[#2a2e39]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Course Progress</span>
                <span className="text-[#00c4b4] font-semibold">{completedLessons}/{totalLessons} Lessons</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
              {overallProgress === 100 && (
                <div className="flex items-center gap-2 mt-3 text-green-400">
                  <Award className="w-5 h-5" />
                  <span className="font-semibold">Course Completed!</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Accordion type="multiple" defaultValue={[]} className="space-y-4">
            <AccordionItem value="impulse" className="border border-[#2a2e39] rounded-lg bg-[#1a1a1a] overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-[#252525]" data-testid="accordion-impulse-waves">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-white">Lesson 1: Impulse Waves</h2>
                    <p className="text-gray-400 text-sm">The 5-wave motive pattern</p>
                  </div>
                  {progress['impulse']?.completed && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto mr-4" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-6 pt-4">
                  <div className="prose prose-invert max-w-none">
                    <h3 className="text-lg font-semibold text-[#00c4b4]">What is an Impulse Wave?</h3>
                    <p className="text-gray-300">
                      An impulse wave is a five-wave pattern that moves in the direction of the larger trend. It consists of 
                      three motive waves (1, 3, 5) separated by two corrective waves (2, 4).
                    </p>

                    <div className="bg-slate-900 p-4 rounded-lg my-4">
                      <h4 className="text-white font-semibold mb-3">Wave Structure: 5-3-5-3-5</h4>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <Badge className="bg-green-600">W1 (5 waves)</Badge>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                        <Badge className="bg-red-600">W2 (3 waves)</Badge>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                        <Badge className="bg-green-600">W3 (5 waves)</Badge>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                        <Badge className="bg-red-600">W4 (3 waves)</Badge>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                        <Badge className="bg-green-600">W5 (5 waves)</Badge>
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold text-[#00c4b4] mt-6">The Three Cardinal Rules</h3>
                    <div className="grid gap-4 mt-3">
                      <Card className="bg-slate-900/50 border-green-600/50">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">1</div>
                            <div>
                              <h4 className="font-semibold text-white">Wave 2 Cannot Retrace Beyond Wave 1</h4>
                              <p className="text-gray-400 text-sm">Wave 2 can never move beyond the starting point of Wave 1. If it does, the count is invalid.</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-900/50 border-yellow-600/50">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-yellow-600 flex items-center justify-center flex-shrink-0">2</div>
                            <div>
                              <h4 className="font-semibold text-white">Wave 3 Cannot Be the Shortest</h4>
                              <p className="text-gray-400 text-sm">Wave 3 is typically the longest and most powerful wave. It can never be shorter than both Waves 1 and 5.</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-900/50 border-blue-600/50">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">3</div>
                            <div>
                              <h4 className="font-semibold text-white">Wave 4 Cannot Overlap Wave 1</h4>
                              <p className="text-gray-400 text-sm">In a standard impulse, Wave 4 cannot enter the price territory of Wave 1. Exception: diagonals.</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <h3 className="text-lg font-semibold text-[#00c4b4] mt-6">Wave Characteristics</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mt-3">
                        <thead className="bg-slate-900">
                          <tr>
                            <th className="text-left p-3 text-gray-400">Wave</th>
                            <th className="text-left p-3 text-gray-400">Typical Behavior</th>
                            <th className="text-left p-3 text-gray-400">Psychology</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          <tr>
                            <td className="p-3 text-green-400 font-mono">Wave 1</td>
                            <td className="p-3 text-gray-300">Initial move, often weak, against prevailing trend</td>
                            <td className="p-3 text-gray-300">Skepticism, seen as bear market rally</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-red-400 font-mono">Wave 2</td>
                            <td className="p-3 text-gray-300">Deep retracement (50-78.6%), never 100%</td>
                            <td className="p-3 text-gray-300">Fear returns, doubt about new trend</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-green-400 font-mono">Wave 3</td>
                            <td className="p-3 text-gray-300">Longest, strongest, extends 161.8%+ of W1</td>
                            <td className="p-3 text-gray-300">Recognition, broad participation, FOMO</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-red-400 font-mono">Wave 4</td>
                            <td className="p-3 text-gray-300">Shallow retracement (38.2%), often complex</td>
                            <td className="p-3 text-gray-300">Profit-taking, consolidation</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-green-400 font-mono">Wave 5</td>
                            <td className="p-3 text-gray-300">Final push, often with divergence</td>
                            <td className="p-3 text-gray-300">Euphoria, late buyers, ending phase</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <QuizComponent quizId="impulse" questions={impulseQuiz} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="diagonal" className="border border-[#2a2e39] rounded-lg bg-[#1a1a1a] overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-[#252525]" data-testid="accordion-diagonal-patterns">
                <div className="flex items-center gap-3">
                  <Zap className="w-6 h-6 text-yellow-500" />
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-white">Lesson 2: Diagonal Patterns</h2>
                    <p className="text-gray-400 text-sm">Leading & ending diagonals</p>
                  </div>
                  {progress['diagonal']?.completed && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto mr-4" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-6 pt-4">
                  <div className="prose prose-invert max-w-none">
                    <h3 className="text-lg font-semibold text-[#00c4b4]">What are Diagonal Patterns?</h3>
                    <p className="text-gray-300">
                      Diagonals are motive waves with a wedge shape, where waves 1 and 4 overlap. They signal exhaustion 
                      in the current trend direction and often lead to sharp reversals.
                    </p>

                    <div className="grid md:grid-cols-2 gap-4 my-4">
                      <Card className="bg-slate-900/50 border-blue-600/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-blue-400">Leading Diagonal</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="text-gray-300 text-sm space-y-2">
                            <li>• Appears in Wave 1 or Wave A position</li>
                            <li>• Internal structure: 3-3-3-3-3</li>
                            <li>• Signals start of a new trend</li>
                            <li>• Usually followed by deep Wave 2</li>
                          </ul>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-900/50 border-purple-600/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-purple-400">Ending Diagonal</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="text-gray-300 text-sm space-y-2">
                            <li>• Appears in Wave 5 or Wave C position</li>
                            <li>• Internal structure: 3-3-3-3-3</li>
                            <li>• Signals exhaustion and reversal</li>
                            <li>• Often followed by swift retracement</li>
                          </ul>
                        </CardContent>
                      </Card>
                    </div>

                    <h3 className="text-lg font-semibold text-[#00c4b4] mt-6">Contracting vs Expanding</h3>
                    <div className="grid md:grid-cols-2 gap-4 mt-3">
                      <div className="bg-slate-900 p-4 rounded-lg">
                        <h4 className="font-semibold text-white mb-2">Contracting Diagonal</h4>
                        <p className="text-gray-400 text-sm mb-2">Wave lengths decrease progressively:</p>
                        <div className="text-gray-300 text-sm font-mono">
                          W1 &gt; W3 &gt; W5<br/>
                          W2 &gt; W4
                        </div>
                        <p className="text-gray-400 text-sm mt-2">Forms a narrowing wedge pattern</p>
                      </div>
                      <div className="bg-slate-900 p-4 rounded-lg">
                        <h4 className="font-semibold text-white mb-2">Expanding Diagonal</h4>
                        <p className="text-gray-400 text-sm mb-2">Wave lengths increase progressively:</p>
                        <div className="text-gray-300 text-sm font-mono">
                          W1 &lt; W3 &lt; W5<br/>
                          W2 &lt; W4
                        </div>
                        <p className="text-gray-400 text-sm mt-2">Forms a widening wedge pattern</p>
                      </div>
                    </div>

                    <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg mt-4">
                      <p className="text-yellow-400 font-semibold">Key Characteristic:</p>
                      <p className="text-gray-300 text-sm mt-1">
                        Unlike impulses, diagonals allow Wave 4 to overlap Wave 1 territory. This overlap is 
                        actually required for a valid diagonal identification.
                      </p>
                    </div>
                  </div>

                  <QuizComponent quizId="diagonal" questions={diagonalQuiz} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="corrective" className="border border-[#2a2e39] rounded-lg bg-[#1a1a1a] overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-[#252525]" data-testid="accordion-corrective-patterns">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-6 h-6 text-red-500" />
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-white">Lesson 3: Corrective Patterns</h2>
                    <p className="text-gray-400 text-sm">Zigzags, flats & triangles</p>
                  </div>
                  {progress['corrective']?.completed && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto mr-4" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-6 pt-4">
                  <div className="prose prose-invert max-w-none">
                    <h3 className="text-lg font-semibold text-[#00c4b4]">The Three Basic Corrective Patterns</h3>
                    
                    <Card className="bg-slate-900/50 border-[#2a2e39] my-4">
                      <CardHeader>
                        <CardTitle className="text-orange-400">Zigzag (5-3-5)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 text-sm mb-3">
                          A sharp correction with strong momentum. Wave A is 5 waves, Wave B retraces 38-78% of A, 
                          and Wave C is 5 waves typically equal to or 161.8% of A.
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Badge className="bg-green-600">A: 5 waves</Badge>
                          <Badge className="bg-purple-600">B: 3 waves (38-78%)</Badge>
                          <Badge className="bg-green-600">C: 5 waves (100-161.8% of A)</Badge>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-[#2a2e39] my-4">
                      <CardHeader>
                        <CardTitle className="text-blue-400">Flat (3-3-5)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 text-sm mb-3">
                          A sideways correction where Wave B approaches or exceeds the start of Wave A. 
                          Wave C typically equals Wave A in length.
                        </p>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Regular Flat</Badge>
                            <span className="text-gray-400">B = 90-105% of A, C = A</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Expanded Flat</Badge>
                            <span className="text-gray-400">B &gt; 105% of A, C = 127-161.8% of A</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Running Flat</Badge>
                            <span className="text-gray-400">B &gt; A, C fails to reach A's end</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-[#2a2e39] my-4">
                      <CardHeader>
                        <CardTitle className="text-cyan-400">Triangle (3-3-3-3-3)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 text-sm mb-3">
                          A five-wave pattern (A-B-C-D-E) that forms a contracting or expanding shape. 
                          Each wave is a three-wave correction. Only appears in Wave 4, B, or X positions.
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <Badge variant="outline" className="mb-1">Contracting</Badge>
                            <p className="text-gray-400">Waves converge to apex</p>
                          </div>
                          <div>
                            <Badge variant="outline" className="mb-1">Expanding</Badge>
                            <p className="text-gray-400">Waves diverge outward</p>
                          </div>
                          <div>
                            <Badge variant="outline" className="mb-1">Ascending</Badge>
                            <p className="text-gray-400">Flat top, rising bottom</p>
                          </div>
                          <div>
                            <Badge variant="outline" className="mb-1">Descending</Badge>
                            <p className="text-gray-400">Flat bottom, falling top</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="bg-blue-900/20 border border-blue-700/50 p-4 rounded-lg">
                      <p className="text-blue-400 font-semibold">Guideline of Alternation:</p>
                      <p className="text-gray-300 text-sm mt-1">
                        If Wave 2 is sharp (zigzag), Wave 4 tends to be flat or complex. If Wave 2 is flat, 
                        Wave 4 tends to be sharp. This helps predict correction types.
                      </p>
                    </div>
                  </div>

                  <QuizComponent quizId="corrective" questions={correctiveQuiz} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="complex" className="border border-[#2a2e39] rounded-lg bg-[#1a1a1a] overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-[#252525]" data-testid="accordion-complex-corrections">
                <div className="flex items-center gap-3">
                  <Target className="w-6 h-6 text-purple-500" />
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-white">Lesson 4: Complex Corrections</h2>
                    <p className="text-gray-400 text-sm">WXY & WXYXZ combinations</p>
                  </div>
                  {progress['complex']?.completed && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto mr-4" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-6 pt-4">
                  <div className="prose prose-invert max-w-none">
                    <h3 className="text-lg font-semibold text-[#00c4b4]">Why Complex Corrections Form</h3>
                    <p className="text-gray-300">
                      When a simple correction (zigzag, flat, or triangle) doesn't achieve sufficient price or time 
                      correction, the market extends the correction by combining patterns with X waves.
                    </p>

                    <Card className="bg-slate-900/50 border-purple-600/50 my-4">
                      <CardHeader>
                        <CardTitle className="text-purple-400">Double Combination (WXY)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 text-sm mb-3">
                          Two corrective patterns connected by an X wave. The X wave is typically a three-wave 
                          correction that moves counter to the overall correction direction.
                        </p>
                        <div className="bg-slate-800 p-3 rounded-lg">
                          <p className="text-sm text-gray-400 mb-2">Common Combinations:</p>
                          <div className="space-y-1 text-sm">
                            <p className="text-gray-300">• Zigzag + Flat</p>
                            <p className="text-gray-300">• Flat + Zigzag</p>
                            <p className="text-gray-300">• Zigzag + Triangle</p>
                            <p className="text-gray-300">• Flat + Triangle</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-pink-600/50 my-4">
                      <CardHeader>
                        <CardTitle className="text-pink-400">Triple Combination (WXYXZ)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-300 text-sm mb-3">
                          Three corrective patterns connected by two X waves. These are rare but occur in 
                          very strong trends where extensive correction is needed.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-blue-600">W</Badge>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                          <Badge variant="outline">X</Badge>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                          <Badge className="bg-green-600">Y</Badge>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                          <Badge variant="outline">X</Badge>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                          <Badge className="bg-purple-600">Z</Badge>
                        </div>
                      </CardContent>
                    </Card>

                    <h3 className="text-lg font-semibold text-[#00c4b4] mt-6">Identifying Combinations</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mt-3">
                        <thead className="bg-slate-900">
                          <tr>
                            <th className="text-left p-3 text-gray-400">Sign</th>
                            <th className="text-left p-3 text-gray-400">Indication</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          <tr>
                            <td className="p-3 text-[#00c4b4]">Simple pattern complete but trend doesn't resume</td>
                            <td className="p-3 text-gray-300">Look for X wave developing</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-[#00c4b4]">Counter-trend rally after correction</td>
                            <td className="p-3 text-gray-300">X wave connecting to next pattern</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-[#00c4b4]">Sideways price action extending</td>
                            <td className="p-3 text-gray-300">Complex correction building</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <QuizComponent quizId="complex" questions={complexQuiz} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fibonacci" className="border border-[#2a2e39] rounded-lg bg-[#1a1a1a] overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-[#252525]" data-testid="accordion-fibonacci-relationships">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-amber-500" />
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-white">Lesson 5: Fibonacci Relationships</h2>
                    <p className="text-gray-400 text-sm">Wave ratios & projections</p>
                  </div>
                  {progress['fibonacci']?.completed && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto mr-4" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-6 pt-4">
                  <div className="prose prose-invert max-w-none">
                    <h3 className="text-lg font-semibold text-[#00c4b4]">Key Fibonacci Ratios</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-amber-400">23.6%</p>
                        <p className="text-gray-400 text-xs">Shallow retracement</p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-amber-400">38.2%</p>
                        <p className="text-gray-400 text-xs">Common W4 target</p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-amber-400">50%</p>
                        <p className="text-gray-400 text-xs">Midpoint (not Fib)</p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-amber-400">61.8%</p>
                        <p className="text-gray-400 text-xs">Golden ratio</p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-400">100%</p>
                        <p className="text-gray-400 text-xs">Equality</p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-400">127.2%</p>
                        <p className="text-gray-400 text-xs">Common extension</p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-400">161.8%</p>
                        <p className="text-gray-400 text-xs">Golden extension</p>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-400">261.8%</p>
                        <p className="text-gray-400 text-xs">Extended W3</p>
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold text-[#00c4b4] mt-6">Typical Wave Relationships</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mt-3">
                        <thead className="bg-slate-900">
                          <tr>
                            <th className="text-left p-3 text-gray-400">Wave</th>
                            <th className="text-left p-3 text-gray-400">Relationship</th>
                            <th className="text-left p-3 text-gray-400">Common Levels</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          <tr>
                            <td className="p-3 text-red-400 font-mono">Wave 2</td>
                            <td className="p-3 text-gray-300">Retracement of W1</td>
                            <td className="p-3 text-amber-400">38.2%, 50%, 61.8%, 78.6%</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-green-400 font-mono">Wave 3</td>
                            <td className="p-3 text-gray-300">Extension of W1</td>
                            <td className="p-3 text-green-400">161.8%, 200%, 261.8%</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-red-400 font-mono">Wave 4</td>
                            <td className="p-3 text-gray-300">Retracement of W3</td>
                            <td className="p-3 text-amber-400">23.6%, 38.2%</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-green-400 font-mono">Wave 5</td>
                            <td className="p-3 text-gray-300">Relation to W1 or W1-3</td>
                            <td className="p-3 text-green-400">61.8%, 100%, 161.8% of W1</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-blue-400 font-mono">Wave C</td>
                            <td className="p-3 text-gray-300">Relation to Wave A</td>
                            <td className="p-3 text-green-400">100%, 127.2%, 161.8% of A</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-green-900/20 border border-green-700/50 p-4 rounded-lg mt-4">
                      <p className="text-green-400 font-semibold">Pro Tip: Confluence</p>
                      <p className="text-gray-300 text-sm mt-1">
                        The most powerful targets occur when multiple Fibonacci levels align. For example, if 
                        Wave 5 = 61.8% of Wave 1 AND hits the 161.8% extension of Waves 1-3, that's a high-probability 
                        reversal zone.
                      </p>
                    </div>
                  </div>

                  <QuizComponent quizId="fibonacci" questions={fibQuiz} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="degrees" className="border border-[#2a2e39] rounded-lg bg-[#1a1a1a] overflow-hidden">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-[#252525]" data-testid="accordion-wave-degrees">
                <div className="flex items-center gap-3">
                  <Award className="w-6 h-6 text-cyan-500" />
                  <div className="text-left">
                    <h2 className="text-xl font-bold text-white">Lesson 6: Wave Degrees</h2>
                    <p className="text-gray-400 text-sm">Fractal nature & hierarchy</p>
                  </div>
                  {progress['degrees']?.completed && <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto mr-4" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="space-y-6 pt-4">
                  <div className="prose prose-invert max-w-none">
                    <h3 className="text-lg font-semibold text-[#00c4b4]">The Fractal Nature of Markets</h3>
                    <p className="text-gray-300">
                      Elliott Wave patterns are fractal - the same patterns appear at all timeframes. Each wave 
                      contains smaller waves of lower degree, and is part of larger waves of higher degree.
                    </p>

                    <h3 className="text-lg font-semibold text-[#00c4b4] mt-6">Degree Hierarchy</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mt-3">
                        <thead className="bg-slate-900">
                          <tr>
                            <th className="text-left p-3 text-gray-400">Degree</th>
                            <th className="text-left p-3 text-gray-400">Motive Notation</th>
                            <th className="text-left p-3 text-gray-400">Typical Timeframe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {WAVE_DEGREES.map((degree, i) => (
                            <tr key={degree.name} className={i < 3 ? 'bg-purple-900/20' : i < 6 ? 'bg-blue-900/20' : 'bg-green-900/20'}>
                              <td className="p-3 text-white font-medium">{degree.name}</td>
                              <td className="p-3 text-gray-300 font-mono">{degree.notation}</td>
                              <td className="p-3 text-gray-400">{degree.timeframe}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <h3 className="text-lg font-semibold text-[#00c4b4] mt-6">Practical Application</h3>
                    <div className="grid md:grid-cols-2 gap-4 mt-3">
                      <Card className="bg-slate-900/50 border-[#2a2e39]">
                        <CardContent className="p-4">
                          <h4 className="font-semibold text-white mb-2">Multi-Timeframe Analysis</h4>
                          <p className="text-gray-400 text-sm">
                            Identify the wave structure on higher timeframes first, then zoom in to find 
                            entry points on lower degree waves. Trade in the direction of the higher degree.
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-900/50 border-[#2a2e39]">
                        <CardContent className="p-4">
                          <h4 className="font-semibold text-white mb-2">Context Awareness</h4>
                          <p className="text-gray-400 text-sm">
                            A Wave 3 of Minor degree within a Wave 3 of Intermediate degree (a "third of a third") 
                            is the most powerful wave position - price tends to accelerate dramatically.
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="bg-cyan-900/20 border border-cyan-700/50 p-4 rounded-lg mt-4">
                      <p className="text-cyan-400 font-semibold">Wave Stack Analysis</p>
                      <p className="text-gray-300 text-sm mt-1">
                        The BearTec Elliott Wave tool includes a "Wave Stack" feature that automatically tracks 
                        patterns across multiple degrees, helping you understand where the current price action 
                        fits within the larger market structure.
                      </p>
                    </div>
                  </div>

                  <QuizComponent quizId="degrees" questions={degreeQuiz} />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Card className="bg-gradient-to-r from-[#00c4b4]/20 to-purple-600/20 border-[#00c4b4]/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <GraduationCap className="w-6 h-6 text-[#00c4b4]" />
                <h3 className="text-xl font-bold text-white">Next Steps</h3>
              </div>
              <p className="text-gray-300 mb-4">
                Now that you understand Elliott Wave theory, practice identifying patterns on real charts using 
                the BearTec Elliott Wave analysis tool.
              </p>
              <Link href="/cryptoelliottwave">
                <Button className="bg-[#00c4b4] hover:bg-[#00a89a]" data-testid="button-go-to-elliott-wave">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Practice on Live Charts
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <CryptoNavigation />
      <div className="h-32 md:h-40"></div>
    </>
  );
}
