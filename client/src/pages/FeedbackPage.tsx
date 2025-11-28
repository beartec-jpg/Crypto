import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Flame, Send, MessageCircle } from "lucide-react";
import { SiX } from "react-icons/si";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { UserHeader } from "@/components/UserHeader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Feedback, InsertFeedback } from "@shared/schema";

export default function FeedbackPage() {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const { toast } = useToast();

  const { data: feedbackList, isLoading } = useQuery({
    queryKey: ['/api/feedback'],
    queryFn: () => fetch('/api/feedback').then(res => res.json()) as Promise<Feedback[]>
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: InsertFeedback) => {
      const response = await apiRequest("POST", "/api/feedback", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feedback'] });
      setRating(0);
      setComment("");
      toast({
        title: "Thank you!",
        description: "Your feedback has been submitted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast({
        title: "Rating Required",
        description: "Please select a rating before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!comment.trim()) {
      toast({
        title: "Comment Required", 
        description: "Please enter a comment with your rating.",
        variant: "destructive",
      });
      return;
    }

    submitFeedbackMutation.mutate({
      rating,
      comment: comment.trim(),
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <UserHeader />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Calculator
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-2">
            <MessageCircle className="w-8 h-8 text-blue-600" />
            Customer Feedback
          </h1>
          <p className="text-muted-foreground">
            Help us improve by sharing your experience with our gas testing calculator
          </p>
        </div>

        {/* Feedback Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Submit Your Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rating Section */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Rate Your Experience</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((flameNumber) => (
                  <button
                    key={flameNumber}
                    onClick={() => setRating(flameNumber)}
                    className="transition-all duration-200 hover:scale-110"
                    data-testid={`flame-rating-${flameNumber}`}
                    aria-label={`Rate ${flameNumber} flame${flameNumber > 1 ? 's' : ''}`}
                  >
                    <Flame
                      className={`w-8 h-8 ${
                        flameNumber <= rating
                          ? 'text-orange-500 fill-orange-500'
                          : 'text-orange-200 opacity-75'
                      } transition-colors duration-200`}
                    />
                  </button>
                ))}
                <span className="ml-3 text-sm text-muted-foreground">
                  {rating === 0 ? 'Click to rate' : 
                   rating === 1 ? '1 flame - Poor' :
                   rating === 2 ? '2 flames - Fair' :
                   rating === 3 ? '3 flames - Good' :
                   rating === 4 ? '4 flames - Very Good' :
                   '5 flames - Excellent'}
                </span>
              </div>
            </div>

            {/* Comment Section */}
            <div className="space-y-3">
              <Label htmlFor="comment" className="text-base font-medium">Your Comments</Label>
              <Textarea
                id="comment"
                placeholder="Tell us about your experience using the calculator, any suggestions for improvement, or issues you encountered..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="resize-none"
                data-testid="textarea-feedback-comment"
              />
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={submitFeedbackMutation.isPending || rating === 0 || !comment.trim()}
              className="w-full"
              data-testid="button-submit-feedback"
            >
              {submitFeedbackMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Feedback
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Previous Feedback */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Recent Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-8 bg-muted rounded"></div>
                  </div>
                ))}
              </div>
            ) : feedbackList && feedbackList.length > 0 ? (
              <div className="space-y-4 max-h-96 overflow-y-auto" data-testid="feedback-list">
                {feedbackList.map((feedback) => (
                  <div
                    key={feedback.id}
                    className="p-4 border rounded-lg bg-muted/30"
                    data-testid={`feedback-item-${feedback.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((flameNumber) => (
                          <Flame
                            key={flameNumber}
                            className={`w-4 h-4 ${
                              flameNumber <= feedback.rating
                                ? 'text-orange-500 fill-orange-500'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                        <span className="text-sm font-medium text-muted-foreground">
                          ({feedback.rating}/5)
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground" data-testid={`feedback-date-${feedback.id}`}>
                        {feedback.createdAt ? formatDate(feedback.createdAt.toString()) : 'Unknown date'}
                      </span>
                    </div>
                    <p className="text-sm" data-testid={`feedback-comment-${feedback.id}`}>
                      {feedback.comment}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8" data-testid="no-feedback-message">
                No feedback yet. Be the first to share your experience!
              </p>
            )}
          </CardContent>
        </Card>

        {/* X Social Link Footer */}
        <div className="mt-12 pt-6 border-t border-border">
          <div className="flex justify-center">
            <a 
              href="https://x.com/beartecuk?t=z-LarE7LCa4ArrQmXfNzug&s=09" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-x-profile"
              aria-label="Follow BearTec on X"
            >
              <SiX className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}