import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const currentUser = await User.findById(loggedInUserId);
    const deletedChats = currentUser?.deletedChats || [];

    const users = await User.find({
      _id: { $ne: loggedInUserId, $nin: deletedChats },
    }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error in getUsersForSidebar:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};




export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      // Upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save(); 

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) { 
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }}

  export const deleteChats = async (req, res) => {
    try {
      console.log("🔍 deleteChats called");
      console.log("req.user:", req.user);
      console.log("req.body:", req.body);
      
      const loggedInUserId = req.user._id;
      if (!loggedInUserId) {
        console.error("❌ No logged-in user");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { userIds } = req.body;
      console.log("userIds received:", userIds);
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "No chats selected for deletion" });
      }
      
      const validUserIds = userIds.filter(id => 
        mongoose.Types.ObjectId.isValid(id) && id !== loggedInUserId.toString()
      );
      if (validUserIds.length !== userIds.length) {
        return res.status(400).json({ error: "Invalid user IDs provided" });
      }
      
      console.log("Valid userIds to delete:", validUserIds);
      
      // Build filters for messages (both directions)
      const deleteFilters = validUserIds.flatMap((userId) => [
        { senderId: loggedInUserId, receiverId: userId },
        { senderId: userId, receiverId: loggedInUserId },
      ]);
      
      console.log("Delete filters:", deleteFilters);
      
      // Delete messages entirely
      console.log("About to delete messages...");
      const deleteResult = await Message.deleteMany({ $or: deleteFilters });
      console.log("Delete result:", deleteResult);
      
      // Update logged-in user's deletedChats (soft delete for them)
      console.log("About to update logged-in user...");
      await User.findByIdAndUpdate(loggedInUserId, {
        $addToSet: { deletedChats: { $each: validUserIds } }
      });
      
      // Permanently delete each other user
      const deletedUsers = [];
      for (const userId of validUserIds) {
        console.log(`🔄 Attempting to permanently delete user ${userId}...`);
        try {
          const deletedUser = await User.findByIdAndDelete(userId);
          if (deletedUser) {
            console.log(`✅ User ${userId} deleted successfully:`, deletedUser.fullName || deletedUser.email);
            deletedUsers.push(userId);
          } else {
            console.log(`❌ User ${userId} not found (already deleted?)`);
          }
        } catch (deleteError) {
          console.error(`❌ Error deleting user ${userId}:`, deleteError.message);
          // Continue to next user instead of crashing
        }
      }
      
      // Emit real-time updates
      const loggedInSocketId = getReceiverSocketId(loggedInUserId);
      if (loggedInSocketId) {
        io.to(loggedInSocketId).emit("chatsDeleted", { deletedUserIds: deletedUsers });
      }
      
      res.status(200).json({
        success: true,
        message: `Chats deleted. Users permanently deleted: ${deletedUsers.length}`,
        deletedUserIds: deletedUsers,
        deletedMessagesCount: deleteResult.deletedCount,
      });
    } catch (error) {
      console.error("❌ Full error:", error.stack);
      res.status(500).json({ error: "Internal server error", details: error.message });
    }
  };