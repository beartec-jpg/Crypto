import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, MessageSquare, Reply, Trash2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCryptoAuth } from "@/hooks/useCryptoAuth";
import bearAvatar from "@assets/1rck2t_1765524724082.jpg";

const ADMIN_EMAIL = 'beartec@beartec.uk';

interface FeedbackReply {
  id: string;
  feedbackId: string;
  responderEmail: string | null;
  responderName: string | null;
  content: string;
  isAdminReply: boolean;
  createdAt: string;
}

interface FeedbackPost {
  id: string;
  userEmail: string | null;
  userName: string | null;
  content: string;
  createdAt: string;
  replies: FeedbackReply[];
}

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}

function Avatar({ email, name, size = 'md' }: { email: string | null; name: string | null; size?: 'sm' | 'md' }) {
  const isAdmin = email === ADMIN_EMAIL;
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  
  if (isAdmin) {
    return (
      <img 
        src={bearAvatar} 
        alt="BearTec Admin" 
        className={`${sizeClasses} rounded-full object-cover border-2 border-[#00c4b4]`}
      />
    );
  }
  
  return (
    <div className={`${sizeClasses} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white`}>
      {getInitials(name, email)}
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function CryptoFeedbackBoard() {
  const { user, isAuthenticated } = useCryptoAuth();
  const { toast } = useToast();
  const [newPost, setNewPost] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  
  const isAdmin = user?.email === ADMIN_EMAIL;
  const userEmail = user?.email || null;
  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.firstName || null;

  const { data: posts = [], isLoading } = useQuery<FeedbackPost[]>({
    queryKey: ['/api/crypto/feedback-board'],
  });

  const createPostMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/crypto/feedback-board", {
        content,
        userEmail,
        userName,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/feedback-board'] });
      setNewPost("");
      toast({ title: "Posted!", description: "Your feedback has been shared." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to post. Please try again.", variant: "destructive" });
    }
  });

  const createReplyMutation = useMutation({
    mutationFn: async ({ feedbackId, content }: { feedbackId: string; content: string }) => {
      const response = await apiRequest("POST", `/api/crypto/feedback-board/${feedbackId}/replies`, {
        content,
        responderEmail: userEmail,
        responderName: userName,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/feedback-board'] });
      setReplyingTo(null);
      setReplyContent("");
      toast({ title: "Reply posted!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reply.", variant: "destructive" });
    }
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/crypto/feedback-board/${id}`, {
        email: userEmail,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/feedback-board'] });
      toast({ title: "Deleted" });
    }
  });

  const deleteReplyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/crypto/feedback-board/replies/${id}`, {
        email: userEmail,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crypto/feedback-board'] });
      toast({ title: "Reply deleted" });
    }
  });

  const handleSubmitPost = () => {
    if (!newPost.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }
    createPostMutation.mutate(newPost.trim());
  };

  const handleSubmitReply = (feedbackId: string) => {
    if (!replyContent.trim()) {
      toast({ title: "Please enter a reply", variant: "destructive" });
      return;
    }
    createReplyMutation.mutate({ feedbackId, content: replyContent.trim() });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/cryptoindicators">
          <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-[#1a1a1a] mb-6" data-testid="link-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Indicators
          </Button>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-3 mb-2">
            <MessageSquare className="w-8 h-8 text-[#00c4b4]" />
            Feedback & Suggestions
          </h1>
          <p className="text-gray-400">
            Share your ideas, report issues, or suggest improvements
          </p>
        </div>

        <Card className="bg-[#1a1a1a] border-[#2a2e39] mb-8">
          <CardContent className="p-4">
            <Textarea
              placeholder={isAuthenticated ? "Share your feedback or suggestion..." : "Sign in to leave feedback..."}
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              disabled={!isAuthenticated}
              className="bg-[#0f0f0f] border-[#2a2e39] text-white placeholder:text-gray-500 min-h-[100px] mb-3"
              data-testid="textarea-new-post"
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {isAuthenticated ? `Posting as ${userName || userEmail || 'Anonymous'}` : 'Sign in to post'}
              </span>
              <Button
                onClick={handleSubmitPost}
                disabled={!isAuthenticated || createPostMutation.isPending || !newPost.trim()}
                className="bg-[#00c4b4] hover:bg-[#00a89c] text-black"
                data-testid="button-submit-post"
              >
                {createPostMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Post
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#00c4b4]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No feedback yet. Be the first to share!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Card key={post.id} className="bg-[#1a1a1a] border-[#2a2e39]" data-testid={`card-post-${post.id}`}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Avatar email={post.userEmail} name={post.userName} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">
                            {post.userEmail === ADMIN_EMAIL ? 'BearTec' : post.userName || 'Anonymous'}
                          </span>
                          {post.userEmail === ADMIN_EMAIL && (
                            <span className="text-xs bg-[#00c4b4] text-black px-2 py-0.5 rounded font-semibold">Admin</span>
                          )}
                          <span className="text-gray-500 text-sm">{formatDate(post.createdAt)}</span>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePostMutation.mutate(post.id)}
                            className="text-gray-500 hover:text-red-400 h-8 w-8 p-0"
                            data-testid={`button-delete-post-${post.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-gray-300 whitespace-pre-wrap">{post.content}</p>
                      
                      {isAdmin && replyingTo !== post.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReplyingTo(post.id)}
                          className="text-[#00c4b4] hover:bg-[#00c4b4]/10 mt-2 h-8"
                          data-testid={`button-reply-${post.id}`}
                        >
                          <Reply className="w-4 h-4 mr-1" />
                          Reply
                        </Button>
                      )}

                      {replyingTo === post.id && (
                        <div className="mt-3 pl-4 border-l-2 border-[#00c4b4]">
                          <Textarea
                            placeholder="Write your reply..."
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            className="bg-[#0f0f0f] border-[#2a2e39] text-white placeholder:text-gray-500 min-h-[80px] mb-2"
                            data-testid="textarea-reply"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSubmitReply(post.id)}
                              disabled={createReplyMutation.isPending}
                              className="bg-[#00c4b4] hover:bg-[#00a89c] text-black"
                              data-testid="button-submit-reply"
                            >
                              {createReplyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setReplyingTo(null); setReplyContent(""); }}
                              className="text-gray-400"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {post.replies && post.replies.length > 0 && (
                        <div className="mt-4 space-y-3">
                          {post.replies.map((reply) => (
                            <div key={reply.id} className="flex gap-3 pl-4 border-l-2 border-[#2a2e39]">
                              <Avatar email={reply.responderEmail} name={reply.responderName} size="sm" />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-white text-sm">
                                      {reply.responderEmail === ADMIN_EMAIL ? 'BearTec' : reply.responderName || 'Anonymous'}
                                    </span>
                                    {reply.isAdminReply && (
                                      <span className="text-xs bg-[#00c4b4] text-black px-1.5 py-0.5 rounded font-semibold">Admin</span>
                                    )}
                                    <span className="text-gray-500 text-xs">{formatDate(reply.createdAt)}</span>
                                  </div>
                                  {isAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteReplyMutation.mutate(reply.id)}
                                      className="text-gray-500 hover:text-red-400 h-6 w-6 p-0"
                                      data-testid={`button-delete-reply-${reply.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                                <p className="text-gray-300 text-sm whitespace-pre-wrap">{reply.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
