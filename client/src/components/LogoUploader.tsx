import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Upload, X, CheckCircle2 } from "lucide-react";

interface LogoUploaderProps {
  onUploadComplete?: (logoUrl: string) => void;
  currentLogoUrl?: string;
  buttonClassName?: string;
  children?: ReactNode;
}

export function LogoUploader({
  onUploadComplete,
  currentLogoUrl,
  buttonClassName,
  children,
}: LogoUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (PNG, JPG, GIF, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5242880) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setUploadProgress(10);

      // Get upload URL
      const uploadRes = await apiRequest("POST", "/api/company-branding/upload-url");
      const uploadResponse = await uploadRes.json();
      console.log('Upload response:', uploadResponse);
      setUploadProgress(30);

      // Validate the upload URL
      if (!uploadResponse || !uploadResponse.uploadURL) {
        throw new Error('No upload URL received from server');
      }

      // Upload file to the storage service
      const uploadResult = await fetch(uploadResponse.uploadURL, {
        method: 'PUT',
        body: selectedFile,
      });
      
      if (!uploadResult.ok) {
        const errorText = await uploadResult.text().catch(() => 'Unknown error');
        throw new Error(`Upload failed (${uploadResult.status}): ${errorText}`);
      }
      
      setUploadProgress(70);

      // Save logo URL to database - use the actual uploaded URL without query parameters
      const logoUrl = uploadResponse.uploadURL.includes('?') 
        ? uploadResponse.uploadURL.split('?')[0] 
        : uploadResponse.uploadURL;
      
      const saveRes = await apiRequest("POST", "/api/company-branding/logo", {
        logoUrl: logoUrl,
      });
      const saveResponse = await saveRes.json();
      
      setUploadProgress(100);
      
      onUploadComplete?.(saveResponse.logoUrl);
      setShowModal(false);
      setSelectedFile(null);
      
      toast({
        title: "Upload successful",
        description: "Your logo has been uploaded and saved.",
      });
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <div>
      <div className="space-y-3">
        {currentLogoUrl && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <img
              src={currentLogoUrl}
              alt="Current logo"
              className="h-12 w-auto object-contain"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Current Logo</p>
              <p className="text-xs text-gray-500">Click to replace</p>
            </div>
          </div>
        )}
        <Button 
          onClick={() => setShowModal(true)} 
          className={buttonClassName}
          variant={currentLogoUrl ? "outline" : "default"}
          data-testid="button-upload-logo"
        >
          {children || (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {currentLogoUrl ? "Replace Logo" : "Upload Logo"}
            </>
          )}
        </Button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md mx-auto bg-white">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Upload Company Logo</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedFile(null);
                    setUploadProgress(0);
                  }}
                  data-testid="button-close-upload"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {!selectedFile ? (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">Drop your logo here</p>
                  <p className="text-sm text-gray-500 mb-4">or click to browse files</p>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-browse-files"
                  >
                    Browse Files
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <p className="text-xs text-gray-500 mt-3">
                    PNG, JPG, GIF up to 5MB. Recommended: 200×80px
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                      disabled={isUploading}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Uploading...
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedFile(null)}
                      disabled={isUploading}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={isUploading}
                      className="flex-1"
                      data-testid="button-confirm-upload"
                    >
                      {isUploading ? 'Uploading...' : 'Upload'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}